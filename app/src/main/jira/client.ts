import type { z } from 'zod';
import { isHttpsUrl } from '../../shared/schemas';
import type { AppError } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import { log } from '../log';
import type { FetchLike } from '../ai/provider';
import { classifyNetworkError, mapStatus, networkError, type NetworkClass } from './error-map';

// Jira Data Center REST API v2 client base (spec section 8). Bearer PAT, JSON, every
// response validated with Zod. The token lives only in this object, in the main process.

export interface JiraClientOptions {
  baseUrl: string;
  token: string;
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

  constructor(private readonly opts: JiraClientOptions) {
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
      Authorization: `Bearer ${this.opts.token}`,
      Accept: 'application/json',
    };
    let payload: string | FormData | undefined;
    if (body && 'json' in body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body && 'form' in body) {
      // Attachments need this header to pass Jira's XSRF check (spec section 8).
      headers['X-Atlassian-Token'] = 'no-check';
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
      log('jira.response', { method, status: response.status, ms: Date.now() - started });
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

export function failureOf(error: unknown): AppError {
  return error instanceof AppFailure ? error.error : appError('UNKNOWN');
}
