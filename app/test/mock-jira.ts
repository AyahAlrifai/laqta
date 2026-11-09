import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

// A small Jira Data Center stand-in for integration and end-to-end tests (spec section 12).
// It implements the endpoints of spec section 8 and can inject failures.

export type CreateFailure =
  | null
  | 'reset-after-create'
  | 'reset-before-create'
  | 'delay-after-create'
  | 400
  | 401
  | 403
  | 404
  | 429
  | 500
  | 503;

export interface MockConfig {
  /** 'cloud' behaves like Jira Cloud (spec section 8.2); Data Center calls are then rejected. */
  deployment: 'datacenter' | 'cloud';
  /** Cloud only: the Atlassian account email in the Basic credentials. */
  email: string;
  token: string;
  createFailure: CreateFailure;
  /** Number of attachment uploads to fail before succeeding; -1 fails forever. */
  attachFailures: number;
  attachStatus: number;
  /** Status for the next idempotent GET calls (consumed one per call). */
  getFailures: number[];
  retryAfterSeconds: number | null;
  delayMs: number;
  duplicates: { key: string; summary: string; status: string }[];
  requiredCustomField: boolean;
  users: { name: string; displayName: string; emailAddress: string }[];
}

export interface MockIssue {
  key: string;
  fields: Record<string, unknown>;
  attachments: { filename: string; size: number }[];
}

export const DEFAULT_USERS = [
  { name: 'sara.h', displayName: 'Sara H.', emailAddress: 'sara.h@example.test' },
  { name: 'sara.k', displayName: 'Sara K.', emailAddress: 'sara.k@example.test' },
  { name: 'omar', displayName: 'Omar Haddad', emailAddress: 'omar@example.test' },
];

export function defaultConfig(): MockConfig {
  return {
    deployment: 'datacenter',
    email: 'tester@example.test',
    token: 'test-token',
    createFailure: null,
    attachFailures: 0,
    attachStatus: 500,
    getFailures: [],
    retryAfterSeconds: null,
    delayMs: 0,
    duplicates: [],
    requiredCustomField: false,
    users: DEFAULT_USERS,
  };
}

export class MockJira {
  config: MockConfig = defaultConfig();
  issues: MockIssue[] = [];
  calls: { method: string; path: string }[] = [];
  private server: Server | null = null;
  private counter = 1000;

  get createCalls(): number {
    return this.calls.filter((c) => c.method === 'POST' && c.path === '/rest/api/2/issue').length;
  }

  get attachCalls(): number {
    return this.calls.filter((c) => c.path.endsWith('/attachments')).length;
  }

  reset(): void {
    this.config = defaultConfig();
    this.issues = [];
    this.calls = [];
    this.counter = 1000;
  }

  async start(port = 0): Promise<string> {
    this.server = createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(port, '127.0.0.1', resolve));
    const { port: actual } = this.server.address() as AddressInfo;
    return `http://127.0.0.1:${String(actual)}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server?.closeAllConnections();
      this.server?.close(() => resolve());
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    const method = req.method ?? 'GET';
    const body = await readBody(req);

    if (path === '/__admin/config' && method === 'POST') {
      this.config = {
        ...this.config,
        ...(JSON.parse(body.toString('utf8')) as Partial<MockConfig>),
      };
      json(res, 200, { ok: true });
      return;
    }
    if (path === '/__admin/state' && method === 'GET') {
      json(res, 200, { issues: this.issues, calls: this.calls });
      return;
    }

    this.calls.push({ method, path });
    const cloud = this.config.deployment === 'cloud';
    const expectedAuth = cloud
      ? `Basic ${Buffer.from(`${this.config.email}:${this.config.token}`).toString('base64')}`
      : `Bearer ${this.config.token}`;
    if (req.headers.authorization !== expectedAuth) {
      json(res, 401, { errorMessages: ['unauthorized'] });
      return;
    }
    if (this.config.delayMs > 0) await sleep(this.config.delayMs);

    if (method === 'GET') {
      const failure = this.config.getFailures.shift();
      if (failure !== undefined) {
        if (failure === 429 && this.config.retryAfterSeconds !== null)
          res.setHeader('Retry-After', String(this.config.retryAfterSeconds));
        json(res, failure, { errorMessages: ['injected'] });
        return;
      }
    }

    if (method === 'GET' && path === '/rest/api/2/myself') {
      json(res, 200, { name: 'tester', displayName: 'Test User' });
      return;
    }
    if (method === 'GET' && path === '/rest/api/2/project') {
      json(res, 200, [
        { key: 'PROJ', name: 'Project' },
        { key: 'REQ', name: 'Required fields' },
      ]);
      return;
    }
    let m = /^\/rest\/api\/2\/issue\/createmeta\/([^/]+)\/issuetypes$/.exec(path);
    if (method === 'GET' && m) {
      if (!['PROJ', 'REQ'].includes(decodeURIComponent(m[1] ?? ''))) {
        json(res, 404, { errorMessages: ['no project'] });
        return;
      }
      json(res, 200, {
        startAt: 0,
        maxResults: 50,
        total: 2,
        isLast: true,
        [cloud ? 'issueTypes' : 'values']: [
          { id: '1', name: 'Bug', subtask: false },
          { id: '2', name: 'Task', subtask: false },
          { id: '3', name: 'Subtask', subtask: true },
        ],
      });
      return;
    }
    m = /^\/rest\/api\/2\/issue\/createmeta\/([^/]+)\/issuetypes\/([^/]+)$/.exec(path);
    if (method === 'GET' && m) {
      const project = decodeURIComponent(m[1] ?? '');
      const values: unknown[] = [
        { fieldId: 'summary', name: 'Summary', required: true, schema: { type: 'string' } },
        { fieldId: 'issuetype', name: 'Issue Type', required: true, schema: { type: 'issuetype' } },
        { fieldId: 'project', name: 'Project', required: true, schema: { type: 'project' } },
        {
          fieldId: 'reporter',
          name: 'Reporter',
          required: true,
          hasDefaultValue: true,
          schema: { type: 'user' },
        },
        {
          fieldId: 'description',
          name: 'Description',
          required: false,
          schema: { type: 'string' },
        },
      ];
      if (project === 'REQ' || this.config.requiredCustomField) {
        values.push({
          fieldId: 'customfield_10010',
          name: 'Team',
          required: true,
          schema: { type: 'option', custom: 'select' },
          allowedValues: [
            { id: '7', value: 'Billing' },
            { id: '8', value: 'Platform' },
          ],
        });
      }
      json(res, 200, {
        startAt: 0,
        maxResults: 100,
        total: values.length,
        isLast: true,
        [cloud ? 'fields' : 'values']: values,
      });
      return;
    }
    if (method === 'GET' && path === '/rest/api/2/priority') {
      json(
        res,
        200,
        ['Highest', 'High', 'Medium', 'Low', 'Lowest'].map((name, i) => ({
          id: String(i + 1),
          name,
        })),
      );
      return;
    }
    if (method === 'GET' && path === '/rest/api/2/user/assignable/search') {
      // Cloud takes `query`, Data Center `username`; the wrong one finds nobody.
      const q = (url.searchParams.get(cloud ? 'query' : 'username') ?? '').toLowerCase();
      if (q === '') {
        json(res, 200, []);
        return;
      }
      const hits = this.config.users.filter(
        (u) =>
          u.name.toLowerCase().startsWith(q) ||
          u.displayName.toLowerCase().startsWith(q) ||
          u.displayName
            .toLowerCase()
            .split(' ')
            .some((p) => p.startsWith(q)),
      );
      json(
        res,
        200,
        hits.map((u) =>
          cloud
            ? {
                accountId: `acc-${u.name}`,
                accountType: 'atlassian',
                displayName: u.displayName,
                active: true,
                avatarUrls: { '48x48': 'https://jira.example.test/avatar.png' },
              }
            : {
                ...u,
                active: true,
                avatarUrls: { '48x48': 'https://jira.example.test/avatar.png' },
              },
        ),
      );
      return;
    }
    const searchPath = cloud ? '/rest/api/3/search/jql' : '/rest/api/2/search';
    if (method === 'POST' && path === searchPath) {
      const { jql } = JSON.parse(body.toString('utf8')) as { jql: string };
      const label = /labels = "([^"]+)"/.exec(jql)?.[1];
      if (label !== undefined) {
        const found = this.issues.filter((i) => (i.fields.labels as string[]).includes(label));
        json(res, 200, {
          issues: found.map((i) => ({ key: i.key, fields: { summary: i.fields.summary } })),
        });
        return;
      }
      json(res, 200, {
        issues: this.config.duplicates.map((d) => ({
          key: d.key,
          fields: { summary: d.summary, status: { name: d.status } },
        })),
      });
      return;
    }
    if (method === 'POST' && path === '/rest/api/2/issue') {
      this.create(req, res, body);
      return;
    }
    m = /^\/rest\/api\/2\/issue\/([^/]+)\/attachments$/.exec(path);
    if (method === 'POST' && m) {
      this.attach(req, res, body, decodeURIComponent(m[1] ?? ''));
      return;
    }
    json(res, 404, { errorMessages: ['not found'] });
  }

  private create(req: IncomingMessage, res: ServerResponse, body: Buffer): void {
    const failure = this.config.createFailure;
    if (failure === 'reset-before-create') {
      req.socket.destroy();
      return;
    }
    if (typeof failure === 'number') {
      if (failure === 429 && this.config.retryAfterSeconds !== null)
        res.setHeader('Retry-After', String(this.config.retryAfterSeconds));
      const errors =
        failure === 400
          ? { errors: { customfield_10010: 'Team is required.' } }
          : { errorMessages: ['injected'] };
      json(res, failure, errors);
      return;
    }
    const { fields } = JSON.parse(body.toString('utf8')) as { fields: Record<string, unknown> };
    if (typeof fields.summary !== 'string' || fields.summary === '') {
      json(res, 400, { errors: { summary: 'Summary is required.' } });
      return;
    }
    const project = (fields.project as { key: string }).key;
    if (
      (project === 'REQ' || this.config.requiredCustomField) &&
      fields.customfield_10010 === undefined
    ) {
      json(res, 400, { errors: { customfield_10010: 'Team is required.' } });
      return;
    }
    const assignee = fields.assignee as { id?: string; name?: string } | undefined;
    if (assignee !== undefined) {
      // Cloud assigns by accountId, Data Center by user name (spec section 8.2).
      const ok =
        this.config.deployment === 'cloud'
          ? typeof assignee.id === 'string'
          : typeof assignee.name === 'string';
      if (!ok) {
        json(res, 400, { errors: { assignee: 'Specify a valid user.' } });
        return;
      }
    }
    this.counter += 1;
    const issue: MockIssue = { key: `${project}-${String(this.counter)}`, fields, attachments: [] };
    this.issues.push(issue);
    if (failure === 'reset-after-create') {
      req.socket.destroy();
      return;
    }
    if (failure === 'delay-after-create') {
      setTimeout(() => json(res, 201, { id: String(this.counter), key: issue.key }), 5_000);
      return;
    }
    json(res, 201, {
      id: String(this.counter),
      key: issue.key,
      self: `http://127.0.0.1/rest/api/2/issue/${issue.key}`,
    });
  }

  private attach(req: IncomingMessage, res: ServerResponse, body: Buffer, key: string): void {
    const issue = this.issues.find((i) => i.key === key);
    if (!issue) {
      json(res, 404, { errorMessages: ['no issue'] });
      return;
    }
    if (req.headers['x-atlassian-token'] !== 'no-check') {
      json(res, 403, { errorMessages: ['XSRF check failed'] });
      return;
    }
    if (this.config.attachFailures !== 0) {
      if (this.config.attachFailures > 0) this.config.attachFailures -= 1;
      json(res, this.config.attachStatus, { errorMessages: ['injected'] });
      return;
    }
    const text = body.toString('latin1');
    const name = /name="file"; filename="([^"]+)"/.exec(text)?.[1];
    if (name === undefined) {
      json(res, 400, { errorMessages: ['no file part'] });
      return;
    }
    issue.attachments.push({ filename: name, size: body.length });
    json(res, 200, [{ id: String(issue.attachments.length), filename: name }]);
  }
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
