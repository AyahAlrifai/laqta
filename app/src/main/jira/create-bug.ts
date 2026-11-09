import {
  JiraAttachmentListSchema,
  JiraCreatedSchema,
  JiraSearchSchema,
} from '../../shared/schemas';
import type { AppError, ApprovedBug, CreateResult } from '../../shared/types';
import { appError } from '../errors';
import { log } from '../log';
import type { JiraClient, JiraDeployment } from './client';
import { mapStatus } from './error-map';
import { JIRA } from './endpoints';

// Spec section 8, create algorithm. Idempotent through the `laqta-<requestId>` label:
// the create is never retried automatically, an unknown outcome is verified by searching
// for the label, and a failed upload never creates a second bug.

export function requestLabel(requestId: string): string {
  return `laqta-${requestId}`;
}

export function buildCreateBody(
  bug: ApprovedBug,
  deployment: JiraDeployment = 'datacenter',
): { fields: Record<string, unknown> } {
  const fields: Record<string, unknown> = {
    ...bug.extraFields,
    project: { key: bug.projectKey },
    issuetype: { name: bug.issueType },
    summary: bug.summary,
    description: bug.descriptionWiki,
    labels: bug.labels,
  };
  if (bug.priority !== null) fields.priority = { name: bug.priority };
  if (bug.assigneeUsername !== null) {
    // Data Center assigns by user name, Cloud by accountId (spec section 8.2).
    fields.assignee =
      deployment === 'cloud' ? { id: bug.assigneeUsername } : { name: bug.assigneeUsername };
  }
  return { fields };
}

export type CreateIssueOutcome =
  | { kind: 'created'; issueKey: string }
  | { kind: 'failed'; error: AppError; retryable: boolean }
  | { kind: 'unknown' };

/** Step 1 to 3: one POST, 30 second timeout, no automatic retry. */
export async function createIssue(
  client: JiraClient,
  bug: ApprovedBug,
): Promise<CreateIssueOutcome> {
  const outcome = await client.raw(
    'POST',
    JIRA.createIssue(),
    { json: buildCreateBody(bug, client.deployment) },
    30_000,
    true,
  );
  if (outcome.kind === 'network') {
    if (outcome.class.sent === false) {
      return { kind: 'failed', error: appError(outcome.class.code), retryable: true };
    }
    return { kind: 'unknown' };
  }
  const { status, body } = outcome;
  if (status >= 200 && status < 300) {
    const parsed = JiraCreatedSchema.safeParse(body);
    if (parsed.success) return { kind: 'created', issueKey: parsed.data.key };
    // Jira says it worked but the body is unreadable: find the issue through its label.
    return { kind: 'unknown' };
  }
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    return { kind: 'failed', error: mapStatus(status, body), retryable: status === 400 };
  }
  if (status === 429) {
    // Rejected before processing; the user may try again after the wait.
    return { kind: 'failed', error: mapStatus(status, body), retryable: true };
  }
  // 5xx and anything else: Jira may have created the issue before failing.
  return { kind: 'unknown' };
}

export const VERIFY_WAITS_MS = [2000, 4000, 8000] as const;

/** Step 3: search for the request label up to three times with 2, 4 and 8 second waits. */
export async function findByRequestLabel(
  client: JiraClient,
  requestId: string,
): Promise<string | null> {
  for (const wait of VERIFY_WAITS_MS) {
    await client.sleep(wait);
    const outcome = await client.raw('POST', JIRA.search(client.deployment), {
      json: {
        jql: `labels = "${requestLabel(requestId)}"`,
        fields: ['summary'],
        maxResults: 1,
      },
    });
    if (outcome.kind === 'response' && outcome.status === 200) {
      const parsed = JiraSearchSchema.safeParse(outcome.body);
      const key = parsed.success ? parsed.data.issues[0]?.key : undefined;
      log('jira.verify', { found: key !== undefined });
      if (key !== undefined) return key;
    }
  }
  return null;
}

export const UPLOAD_BACKOFF_MS = [1000, 3000] as const;

export interface UploadOptions {
  png: Uint8Array;
  fileName: string;
  /** Returns a smaller PNG for one automatic retry after 413, or null if it cannot shrink. */
  downscale: (png: Uint8Array) => Uint8Array | null;
}

/** Step 4: upload with up to three attempts and backoff. */
export async function uploadAttachment(
  client: JiraClient,
  issueKey: string,
  opts: UploadOptions,
): Promise<{ ok: true } | { ok: false; error: AppError }> {
  let png = opts.png;
  let shrunk = false;
  let lastError: AppError = appError('UNKNOWN');
  for (let attempt = 0; attempt < 3; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), opts.fileName);
    const outcome = await client.raw('POST', JIRA.attachments(issueKey), { form }, 60_000);
    if (outcome.kind === 'response') {
      if (outcome.status >= 200 && outcome.status < 300) {
        // A 2xx means Jira stored the file; retrying would attach a second copy.
        log('jira.attach', {
          ok: true,
          attempt,
          shape: JiraAttachmentListSchema.safeParse(outcome.body).success,
        });
        return { ok: true };
      }
      lastError = mapStatus(outcome.status, outcome.body);
      if (outcome.status === 413 && !shrunk) {
        const smaller = opts.downscale(png);
        shrunk = true;
        if (smaller === null) break;
        png = smaller;
        continue;
      }
      if ([400, 401, 403, 404, 413].includes(outcome.status)) break;
      if (outcome.status === 429) await client.sleep(outcome.retryAfterMs ?? 1000);
    } else {
      lastError = appError(outcome.class.code);
    }
    const backoff = UPLOAD_BACKOFF_MS[attempt];
    if (backoff !== undefined) await client.sleep(backoff);
  }
  log('jira.attach', { ok: false, code: lastError.code });
  return { ok: false, error: lastError };
}

export interface CreateBugHooks {
  onVerifying?: () => void;
  onCreated?: (issueKey: string) => void;
}

/** The whole algorithm in one call; the orchestrator drives the same steps one by one. */
export async function createBug(
  client: JiraClient,
  bug: ApprovedBug,
  upload: Omit<UploadOptions, 'fileName'>,
  hooks: CreateBugHooks = {},
): Promise<CreateResult> {
  const created = await createIssue(client, bug);
  let issueKey: string;
  if (created.kind === 'failed')
    return { kind: 'failed', error: created.error, retryable: created.retryable };
  if (created.kind === 'unknown') {
    hooks.onVerifying?.();
    const found = await findByRequestLabel(client, bug.requestId);
    if (found === null) {
      return {
        kind: 'failed',
        error: appError('NETWORK_UNREACHABLE', { detail: 'create outcome unknown, not found' }),
        retryable: true,
      };
    }
    issueKey = found;
  } else {
    issueKey = created.issueKey;
  }
  hooks.onCreated?.(issueKey);
  return attachAndFinish(client, issueKey, { ...upload, fileName: bug.attachmentFileName });
}

export async function attachAndFinish(
  client: JiraClient,
  issueKey: string,
  upload: UploadOptions,
): Promise<CreateResult> {
  const browseUrl = client.browseUrl(issueKey);
  const result = await uploadAttachment(client, issueKey, upload);
  if (result.ok) return { kind: 'ok', issueKey, browseUrl };
  return { kind: 'partial', issueKey, browseUrl, attachmentError: result.error };
}
