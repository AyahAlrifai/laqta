import type { z } from 'zod';
import { isHttpsUrl } from '../../shared/schemas';
import type { AppError } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import { log } from '../log';
import type { FetchLike } from '../ai/provider';
import { classifyNetworkError, mapStatus, networkError, type NetworkClass } from './error-map';

// Jira REST API v2 client base (spec sections 8 and 8.2). Data Center uses a Bearer PAT,
// Cloud uses Basic email:apiToken. Every response is validated with Zod. The token lives only
// in this object, in the main process.

export type JiraDeployment = 'datacenter' | 'cloud';

export interface JiraClientOptions {
  baseUrl: string;
  token: string;
  /** Default 'datacenter'. */
  deployment?: JiraDeployment;
  /** Atlassian account email; required for 'cloud'. */
  email?: string;
  fetch: FetchLike;
  /**
   * Sends on a connection that has never been used. Chromium silently resends a request
   * (POST included) when a reused keep-alive socket is reset, which would create a second
   * bug; a fresh connection is never resent (spec section 14, item 14).
   */
  freshFetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Tests and the E2E mock server run on http://127.0.0.1. Never set in production. */
  allowHttpForTests?: boolean;
  timeoutMs?: number;
}

export type RawOutcome =
  | { kind: 'response'; status: number; body: unknown; retryAfterMs: number | null }
  | { kind: 'network'; error: unknown; class: NetworkClass };

export const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const MAX_RETRY_AFTER_MS = 10_000;
const BACKOFF_MS = [500, 1500] as const;

export function parseRetryAfter(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

export class JiraClient {
  readonly baseUrl: string;
  readonly host: string;
  readonly sleep: (ms: number) => Promise<void>;
  readonly deployment: JiraDeployment;
  private readonly authorization: string;

  constructor(private readonly opts: JiraClientOptions) {
    this.deployment = opts.deployment ?? 'datacenter';
    if (this.deployment === 'cloud') {
      const email = (opts.email ?? '').trim();
      if (email === '')
        throw new AppFailure(appError('AUTH_INVALID', { detail: 'cloud needs an email' }));
      this.authorization = `Basic ${Buffer.from(`${email}:${opts.token}`, 'utf8').toString('base64')}`;
    } else {
      this.authorization = `Bearer ${opts.token}`;
    }
    const isLocalHttp =
      opts.allowHttpForTests === true && /^http:\/\/127\.0\.0\.1(:\d+)?/.test(opts.baseUrl);
    if (!isHttpsUrl(opts.baseUrl) && !isLocalHttp) {
      throw new AppFailure(appError('UNKNOWN', { detail: 'jira base url must be https' }));
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.host = new URL(this.baseUrl).host.toLowerCase();
    this.sleep = opts.sleep ?? defaultSleep;
  }

  browseUrl(issueKey: string): string {
    return `${this.baseUrl}/browse/${encodeURIComponent(issueKey)}`;
  }

  /** One HTTP exchange, no retries. Used directly by the create algorithm. */
  async raw(
    method: 'GET' | 'POST',
    path: string,
    body?: { json: unknown } | { form: FormData },
    timeoutMs?: number,
    fresh = false,
  ): Promise<RawOutcome> {
    const headers: Record<string, string> = {
      Authorization: this.authorization,
      Accept: 'application/json',
    };
    // Requests go out through Chromium (net.fetch), which by default sends a browser user
    // agent. Jira Cloud then treats every POST as a browser form post and fails its XSRF check
    // (403) even with the opt-out header, while GETs still work. Identifying as an API client
    // avoids that; Sec-Fetch-* headers are removed for the same reason in api-session.ts.
    headers['User-Agent'] = JIRA_USER_AGENT;
    if (method === 'POST') headers['X-Atlassian-Token'] = 'no-check';
    let payload: string | FormData | undefined;
    if (body && 'json' in body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body && 'form' in body) {
      payload = body.form;
    }
    const started = Date.now();
    try {
      const send = fresh ? (this.opts.freshFetch ?? this.opts.fetch) : this.opts.fetch;
      const response = await send(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: payload,
        signal: AbortSignal.timeout(timeoutMs ?? this.opts.timeoutMs ?? 30_000),
        redirect: 'error',
      });
      const text = await response.text();
      let parsed: unknown = null;
      if (text !== '') {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = null;
        }
      }
      log('jira.response', {
        method,
        path: logPath(path),
        status: response.status,
        ms: Date.now() - started,
        ...(response.status === 403 && /xsrf/i.test(text) ? { reason: 'xsrf' } : {}),
      });
      return {
        kind: 'response',
        status: response.status,
        body: parsed,
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      };
    } catch (error) {
      const c = classifyNetworkError(error);
      log('jira.response', {
        method,
        path: logPath(path),
        network: c.code,
        sent: String(c.sent),
        ms: Date.now() - started,
      });
      return { kind: 'network', error, class: c };
    }
  }

  /**
   * Idempotent request with the retry rules of spec section 8: honour Retry-After once on
   * 429, back off on 5xx. Throws AppFailure on any error.
   */
  async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    json?: unknown,
  ): Promise<T> {
    let rateLimitedOnce = false;
    for (let attempt = 0; ; attempt++) {
      const outcome = await this.raw(method, path, json === undefined ? undefined : { json });
      if (outcome.kind === 'network') {
        throw new AppFailure(networkError(outcome.error));
      }
      const { status, body } = outcome;
      if (status >= 200 && status < 300) {
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          throw new AppFailure(appError('UNKNOWN', { detail: 'unexpected jira response shape' }));
        }
        return parsed.data;
      }
      if (status === 429 && !rateLimitedOnce) {
        rateLimitedOnce = true;
        await this.sleep(outcome.retryAfterMs ?? 1000);
        continue;
      }
      const backoff = BACKOFF_MS[attempt];
      if (status >= 500 && backoff !== undefined) {
        await this.sleep(backoff);
        continue;
      }
      throw new AppFailure(mapStatus(status, body));
    }
  }
}

/**
 * The endpoint without its query string, so a failing call can be told apart in the log.
 * Queries are dropped because they can hold what the user typed (assignee search, JQL).
 */
/** Deliberately not browser-like; see the XSRF note in `raw()`. */
export const JIRA_USER_AGENT = 'Laqta';

export function logPath(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

export function failureOf(error: unknown): AppError {
  return error instanceof AppFailure ? error.error : appError('UNKNOWN');
}
