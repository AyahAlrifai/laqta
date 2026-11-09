import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveAssignee } from '../src/main/jira/assignee';
import { JiraClient } from '../src/main/jira/client';
import { createBug } from '../src/main/jira/create-bug';
import { loadCreateMeta } from '../src/main/jira/create-meta';
import { checkDuplicates } from '../src/main/jira/duplicates';
import { JIRA } from '../src/main/jira/endpoints';
import { AppFailure } from '../src/main/errors';
import { JiraMyselfSchema } from '../src/shared/schemas';
import type { ApprovedBug } from '../src/shared/types';
import { MockJira } from './mock-jira';

// Spec section 8.2: the same algorithms against a Jira Cloud-shaped server.

const mock = new MockJira();
let baseUrl = '';

function cloudClient(opts: { email?: string; token?: string } = {}): JiraClient {
  return new JiraClient({
    baseUrl,
    token: opts.token ?? 'cloud-api-token',
    deployment: 'cloud',
    email: opts.email ?? 'tester@example.test',
    fetch: (input, init) => fetch(input, init),
    sleep: () => Promise.resolve(),
    allowHttpForTests: true,
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
  assigneeUsername: 'acc-sara.h',
  labels: ['laqta', `laqta-${requestId}`],
  extraFields: {},
  attachmentFileName: `laqta-${requestId}.png`,
};
const upload = { png: new Uint8Array([137, 80, 78, 71, 1, 2]), downscale: () => null };

beforeAll(async () => {
  baseUrl = await mock.start();
});
afterAll(async () => {
  await mock.stop();
});
beforeEach(() => {
  mock.reset();
  mock.config.deployment = 'cloud';
  mock.config.token = 'cloud-api-token';
});

describe('Jira Cloud (spec section 8.2)', () => {
  it('authenticates with Basic email:apiToken', async () => {
    const me = await cloudClient().request('GET', JIRA.myself(), JiraMyselfSchema);
    expect(me.displayName).toBe('Test User');
  });

  it('a wrong email or a Bearer token is AUTH_INVALID', async () => {
    await expect(
      cloudClient({ email: 'other@example.test' }).request('GET', JIRA.myself(), JiraMyselfSchema),
    ).rejects.toMatchObject({
      error: { code: 'AUTH_INVALID' },
    });
    const bearer = new JiraClient({
      baseUrl,
      token: 'cloud-api-token',
      fetch: (i, init) => fetch(i, init),
      allowHttpForTests: true,
    });
    await expect(bearer.request('GET', JIRA.myself(), JiraMyselfSchema)).rejects.toMatchObject({
      error: { code: 'AUTH_INVALID' },
    });
  });

  it('needs an email', () => {
    expect(() => cloudClient({ email: '' })).toThrow(AppFailure);
  });

  it('reads createmeta from issueTypes and fields, and skips subtask types', async () => {
    const meta = await loadCreateMeta(cloudClient(), 'REQ');
    expect(meta.issueTypes.map((t) => t.name)).toEqual(['Bug', 'Task']);
    expect(meta.requiredFields.map((f) => f.id)).toEqual(['customfield_10010']);
  });

  it('finds assignees with query= and uses the accountId', async () => {
    const r = await resolveAssignee(cloudClient(), 'PROJ', 'Omar', null);
    expect(r.preselected).toBe('acc-omar');
    const many = await resolveAssignee(cloudClient(), 'PROJ', 'Sara', null);
    expect(many.candidates.map((c) => c.username)).toEqual(['acc-sara.h', 'acc-sara.k']);
    expect(many.preselected).toBeNull();
  });

  it('creates with assignee { id }, attaches, and searches with /rest/api/3/search/jql', async () => {
    const result = await createBug(cloudClient(), bug, upload);
    expect(result.kind).toBe('ok');
    expect(mock.issues[0]?.fields.assignee).toEqual({ id: 'acc-sara.h' });
    expect(mock.issues[0]?.attachments).toHaveLength(1);
    mock.config.createFailure = 'reset-after-create';
    const second = '7f1c2b8e-4d3a-4b2c-9e1f-0a1b2c3d4e5f';
    const verified = await createBug(
      cloudClient(),
      { ...bug, requestId: second, labels: ['laqta', `laqta-${second}`] },
      upload,
    );
    expect(verified.kind).toBe('ok');
    expect(mock.calls.some((c) => c.path === '/rest/api/3/search/jql')).toBe(true);
  });

  it('duplicate check uses the Cloud search endpoint', async () => {
    mock.config.duplicates = [
      { key: 'PROJ-9', summary: 'Invoice total repeated', status: 'To Do' },
    ];
    const hits = await checkDuplicates(cloudClient(), 'PROJ', 'Invoice total shown twice');
    expect(hits.map((h) => h.key)).toEqual(['PROJ-9']);
  });
});
