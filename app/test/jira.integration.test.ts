import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveAssignee } from '../src/main/jira/assignee';
import { JiraClient } from '../src/main/jira/client';
import { attachAndFinish, createBug } from '../src/main/jira/create-bug';
import { listProjects, loadCreateMeta } from '../src/main/jira/create-meta';
import { checkDuplicates } from '../src/main/jira/duplicates';
import { classifyNetworkError } from '../src/main/jira/error-map';
import { JIRA } from '../src/main/jira/endpoints';
import { AppFailure } from '../src/main/errors';
import { JiraMyselfSchema } from '../src/shared/schemas';
import type { ApprovedBug } from '../src/shared/types';
import { MockJira } from './mock-jira';

const mock = new MockJira();
let baseUrl = '';
const sleeps: number[] = [];

function client(opts: { token?: string; timeoutMs?: number; baseUrl?: string } = {}): JiraClient {
  return new JiraClient({
    baseUrl: opts.baseUrl ?? baseUrl,
    token: opts.token ?? 'test-token',
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    allowHttpForTests: true,
    timeoutMs: opts.timeoutMs,
  });
}

const requestId = '6f1c2b8e-4d3a-4b2c-9e1f-0a1b2c3d4e5f';
const bug: ApprovedBug = {
  requestId,
  projectKey: 'PROJ',
  issueType: 'Bug',
  summary: 'Invoice total is displayed twice',
  descriptionWiki: 'h3. Environment\nBilling',
  priority: 'Medium',
  assigneeUsername: 'sara.h',
  labels: ['laqta', `laqta-${requestId}`],
  extraFields: {},
  attachmentFileName: `laqta-${requestId}.png`,
};
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
const upload = { png, downscale: (p: Uint8Array) => p.slice(0, Math.max(1, p.length >> 1)) };

async function failureCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof AppFailure ? error.error.code : 'not AppFailure';
  }
}

beforeAll(async () => {
  baseUrl = await mock.start();
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(() => {
  mock.reset();
  sleeps.length = 0;
});

describe('error mapping (spec section 8), one test per row', () => {
  it('401 -> AUTH_INVALID', async () => {
    expect(
      await failureCode(client({ token: 'wrong' }).request('GET', JIRA.myself(), JiraMyselfSchema)),
    ).toBe('AUTH_INVALID');
  });

  it('403 -> FORBIDDEN, no retry', async () => {
    mock.config.getFailures = [403];
    expect(await failureCode(client().request('GET', JIRA.myself(), JiraMyselfSchema))).toBe(
      'FORBIDDEN',
    );
    expect(mock.calls).toHaveLength(1);
  });

  it('404 on project -> NOT_FOUND', async () => {
    expect(await failureCode(loadCreateMeta(client(), 'NOPE'))).toBe('NOT_FOUND');
  });

  it('400 -> FIELD_ERROR with errors per field', async () => {
    mock.config.createFailure = 400;
    const result = await createBug(client(), bug, upload);
    expect(result.kind).toBe('failed');
    if (result.kind !== 'failed') return;
    expect(result.error.code).toBe('FIELD_ERROR');
    expect(result.error.fieldErrors).toEqual({ customfield_10010: 'Team is required.' });
    expect(mock.calls.some((c) => c.path === '/rest/api/2/search')).toBe(false);
  });

  it('413 on the attachment -> downscale and retry once automatically', async () => {
    mock.config.attachFailures = 1;
    mock.config.attachStatus = 413;
    const result = await createBug(client(), bug, upload);
    expect(result.kind).toBe('ok');
    expect(mock.attachCalls).toBe(2);
    expect(mock.issues[0]?.attachments).toHaveLength(1);
  });

  it('413 twice -> partial with ATTACHMENT_TOO_LARGE', async () => {
    mock.config.attachFailures = -1;
    mock.config.attachStatus = 413;
    const result = await createBug(client(), bug, upload);
    expect(result.kind).toBe('partial');
    if (result.kind === 'partial') expect(result.attachmentError.code).toBe('ATTACHMENT_TOO_LARGE');
    expect(mock.createCalls).toBe(1);
  });

  it('429 -> honours Retry-After, then RATE_LIMITED', async () => {
    mock.config.getFailures = [429, 429];
    mock.config.retryAfterSeconds = 3;
    expect(await failureCode(client().request('GET', JIRA.myself(), JiraMyselfSchema))).toBe(
      'RATE_LIMITED',
    );
    expect(sleeps).toEqual([3000]);
  });

  it('429 once -> succeeds after waiting', async () => {
    mock.config.getFailures = [429];
    mock.config.retryAfterSeconds = 1;
    const me = await client().request('GET', JIRA.myself(), JiraMyselfSchema);
    expect(me.displayName).toBe('Test User');
  });

  it('5xx -> backoff for idempotent calls', async () => {
    mock.config.getFailures = [500, 503];
    const me = await client().request('GET', JIRA.myself(), JiraMyselfSchema);
    expect(me.name).toBe('tester');
    expect(sleeps).toEqual([500, 1500]);
  });

  it('5xx persisting -> SERVER_ERROR', async () => {
    mock.config.getFailures = [500, 500, 500];
    expect(await failureCode(client().request('GET', JIRA.myself(), JiraMyselfSchema))).toBe(
      'SERVER_ERROR',
    );
  });

  it('5xx is never retried on create (not idempotent)', async () => {
    mock.config.createFailure = 500;
    await createBug(client(), bug, upload);
    expect(mock.createCalls).toBe(1);
  });

  it('connection refused -> NETWORK_UNREACHABLE', async () => {
    const dead = client({ baseUrl: 'http://127.0.0.1:9' });
    expect(await failureCode(dead.request('GET', JIRA.myself(), JiraMyselfSchema))).toBe(
      'NETWORK_UNREACHABLE',
    );
    const result = await createBug(dead, bug, upload);
    expect(result).toMatchObject({
      kind: 'failed',
      retryable: true,
      error: { code: 'NETWORK_UNREACHABLE' },
    });
  });

  it('timeout -> NETWORK_UNREACHABLE for reads', async () => {
    mock.config.delayMs = 300;
    expect(
      await failureCode(client({ timeoutMs: 50 }).request('GET', JIRA.myself(), JiraMyselfSchema)),
    ).toBe('NETWORK_UNREACHABLE');
  });

  it('certificate failure -> TLS_ERROR (Node and Electron error shapes)', () => {
    const nodeErr = new TypeError('fetch failed', {
      cause: Object.assign(new Error('unable to verify the first certificate'), {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      }),
    });
    expect(classifyNetworkError(nodeErr)).toEqual({ code: 'TLS_ERROR', sent: false });
    expect(classifyNetworkError(new Error('net::ERR_CERT_AUTHORITY_INVALID'))).toEqual({
      code: 'TLS_ERROR',
      sent: false,
    });
    expect(classifyNetworkError(new Error('net::ERR_NAME_NOT_RESOLVED'))).toEqual({
      code: 'NETWORK_UNREACHABLE',
      sent: false,
    });
    expect(classifyNetworkError(new Error('net::ERR_CONNECTION_RESET'))).toEqual({
      code: 'NETWORK_UNREACHABLE',
      sent: 'unknown',
    });
  });
});

describe('create algorithm (spec section 8)', () => {
  it('creates, attaches and returns ok with the browse URL', async () => {
    const result = await createBug(client(), bug, upload);
    expect(result).toEqual({
      kind: 'ok',
      issueKey: 'PROJ-1001',
      browseUrl: `${baseUrl}/browse/PROJ-1001`,
    });
    const issue = mock.issues[0];
    expect(issue?.fields.labels).toEqual(['laqta', `laqta-${requestId}`]);
    expect(issue?.fields.assignee).toEqual({ name: 'sara.h' });
    expect(issue?.fields.priority).toEqual({ name: 'Medium' });
    expect(issue?.attachments[0]?.filename).toBe(`laqta-${requestId}.png`);
  });

  it('omits priority and assignee when null', async () => {
    await createBug(client(), { ...bug, priority: null, assigneeUsername: null }, upload);
    expect(mock.issues[0]?.fields).not.toHaveProperty('priority');
    expect(mock.issues[0]?.fields).not.toHaveProperty('assignee');
  });

  it('unknown result (reset after create) verifies by label and creates exactly one bug', async () => {
    mock.config.createFailure = 'reset-after-create';
    let verifying = false;
    const result = await createBug(client(), bug, upload, {
      onVerifying: () => (verifying = true),
    });
    expect(verifying).toBe(true);
    expect(result.kind).toBe('ok');
    expect(mock.issues).toHaveLength(1);
    expect(mock.createCalls).toBe(1);
    expect(sleeps[0]).toBe(2000);
  });

  it('unknown result with no issue found -> failed, retryable, after three searches', async () => {
    mock.config.createFailure = 'reset-before-create';
    const result = await createBug(client(), bug, upload);
    expect(result).toMatchObject({ kind: 'failed', retryable: true });
    expect(mock.calls.filter((c) => c.path === '/rest/api/2/search')).toHaveLength(3);
    expect(sleeps).toEqual([2000, 4000, 8000]);
    expect(mock.issues).toHaveLength(0);
  });

  it('timeout after sending -> verify finds the issue', async () => {
    mock.config.createFailure = 'delay-after-create';
    const result = await createBug(client({ timeoutMs: 200 }), bug, upload);
    // The create call has its own 30 s timeout; use a short client to simulate it.
    expect(['ok', 'failed']).toContain(result.kind);
    expect(mock.issues).toHaveLength(1);
  }, 40_000);

  it('attachment failure gives partial and never a second bug; retry uploads only', async () => {
    mock.config.attachFailures = 3;
    const result = await createBug(client(), bug, upload);
    expect(result.kind).toBe('partial');
    expect(mock.createCalls).toBe(1);
    expect(mock.attachCalls).toBe(3);
    if (result.kind !== 'partial') return;
    const retry = await attachAndFinish(client(), result.issueKey, {
      ...upload,
      fileName: bug.attachmentFileName,
    });
    expect(retry.kind).toBe('ok');
    expect(mock.createCalls).toBe(1);
    expect(mock.issues).toHaveLength(1);
    expect(mock.issues[0]?.attachments).toHaveLength(1);
  });

  it('sends the XSRF header and a multipart field named file', async () => {
    const result = await createBug(client(), bug, upload);
    expect(result.kind).toBe('ok');
    expect(mock.issues[0]?.attachments[0]?.filename).toBe(bug.attachmentFileName);
  });
});

describe('create metadata, assignees and duplicates', () => {
  it('lists projects', async () => {
    expect((await listProjects(client())).map((p) => p.key)).toEqual(['PROJ', 'REQ']);
  });

  it('loads issue types, priorities and only the required fields the user must fill', async () => {
    const meta = await loadCreateMeta(client(), 'REQ');
    expect(meta.issueTypes.map((i) => i.name)).toEqual(['Bug', 'Task']);
    expect(meta.priorities).toEqual(['Highest', 'High', 'Medium', 'Low', 'Lowest']);
    expect(meta.requiredFields).toEqual([
      {
        id: 'customfield_10010',
        name: 'Team',
        schemaType: 'option',
        allowedValues: [
          { id: '7', label: 'Billing' },
          { id: '8', label: 'Platform' },
        ],
      },
    ]);
    expect((await loadCreateMeta(client(), 'PROJ')).requiredFields).toEqual([]);
  });

  it('a project with a required custom field rejects a create without it', async () => {
    const result = await createBug(client(), { ...bug, projectKey: 'REQ' }, upload);
    expect(result).toMatchObject({ kind: 'failed', error: { code: 'FIELD_ERROR' } });
    const ok = await createBug(
      client(),
      { ...bug, projectKey: 'REQ', extraFields: { customfield_10010: { id: '7' } } },
      upload,
    );
    expect(ok.kind).toBe('ok');
  });

  it('assignee: zero candidates', async () => {
    const r = await resolveAssignee(client(), 'PROJ', 'Nobody', null);
    expect(r).toEqual({ candidates: [], preselected: null, matchedFrom: null });
  });

  it('assignee: one candidate is preselected and says how it matched', async () => {
    const r = await resolveAssignee(client(), 'PROJ', 'Omar', null);
    expect(r.preselected).toBe('omar');
    expect(r.matchedFrom).toBe('Omar');
  });

  it('assignee: many candidates force a choice', async () => {
    const r = await resolveAssignee(client(), 'PROJ', 'سارة', 'Sara');
    expect(r.candidates.map((c) => c.username)).toEqual(['sara.h', 'sara.k']);
    expect(r.preselected).toBeNull();
  });

  it('duplicates come back as warnings', async () => {
    mock.config.duplicates = [
      { key: 'PROJ-1180', summary: 'Invoice total repeated', status: 'Open' },
    ];
    const hits = await checkDuplicates(client(), 'PROJ', 'Invoice "total" \\ shown twice');
    expect(hits).toEqual([
      {
        key: 'PROJ-1180',
        summary: 'Invoice total repeated',
        status: 'Open',
        browseUrl: `${baseUrl}/browse/PROJ-1180`,
      },
    ]);
  });

  it('rejects a non-https base URL outside tests', () => {
    expect(
      () =>
        new JiraClient({
          baseUrl: 'http://jira.example.test',
          token: 't',
          fetch: (i, init) => fetch(i, init),
        }),
    ).toThrow(AppFailure);
  });
});
