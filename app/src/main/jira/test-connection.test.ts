import { afterEach, describe, expect, it } from 'vitest';
import { setLogSink } from '../log';
import { JiraClient } from './client';
import { testJiraConnection } from './test-connection';

// A controllable fetch: each path gets a handler, so a test can answer, fail or hang one
// endpoint independently of the other.
type Handler = () => Promise<Response>;

const json = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
const never: Handler = () => new Promise<Response>(() => undefined);

function client(routes: Record<string, Handler>, sleeps: number[] = []): JiraClient {
  return new JiraClient({
    baseUrl: 'https://jira.example.test',
    token: 'test-token',
    fetch: (input) => {
      const path = new URL(input).pathname;
      const handler = routes[path];
      return handler ? handler() : json(404, {})();
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
}

const myselfOk = json(200, { name: 'sara.h', displayName: 'Sara H' });
const MYSELF = '/rest/api/2/myself';
const PROJECTS = '/rest/api/2/project';

function captureLog(): string[] {
  const lines: string[] = [];
  setLogSink({ write: (line) => lines.push(line) });
  return lines;
}

afterEach(() => {
  setLogSink({ write: () => undefined });
});

describe('testJiraConnection', () => {
  it('returns the user and the sorted project list on success', async () => {
    const result = await testJiraConnection(
      client({
        [MYSELF]: myselfOk,
        [PROJECTS]: json(200, [
          { id: '2', key: 'WEB', name: 'Web' },
          { id: '1', key: 'API', name: 'Api' },
        ]),
      }),
    );
    expect(result).toEqual({
      ok: true,
      userDisplayName: 'Sara H',
      projects: [
        { key: 'API', name: 'Api' },
        { key: 'WEB', name: 'Web' },
      ],
    });
  });

  it.each([403, 500])(
    'stays ok without projects when the project list answers %i, and logs the code only',
    async (status) => {
      const lines = captureLog();
      const result = await testJiraConnection(
        client({
          [MYSELF]: myselfOk,
          [PROJECTS]: json(status, { errorMessages: ['secret body'] }),
        }),
      );
      expect(result).toEqual({ ok: true, userDisplayName: 'Sara H' });
      const entry = lines
        .map((l) => JSON.parse(l) as Record<string, unknown>)
        .find((e) => e.event === 'jira.projects');
      expect(entry).toMatchObject({ outcome: 'failed' });
      expect(typeof entry?.code).toBe('string');
      expect(lines.join('\n')).not.toContain('secret body');
      expect(lines.join('\n')).not.toContain('test-token');
    },
  );

  it('fails with AUTH_INVALID on a bad token, whatever the project list does', async () => {
    const result = await testJiraConnection(client({ [MYSELF]: json(401, {}), [PROJECTS]: never }));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('AUTH_INVALID');
    expect(result.projects).toBeUndefined();
  });

  it('does not wait for a hanging project list beyond the grace period', async () => {
    const lines = captureLog();
    const started = Date.now();
    const result = await testJiraConnection(client({ [MYSELF]: myselfOk, [PROJECTS]: never }), 50);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result).toEqual({ ok: true, userDisplayName: 'Sara H' });
    expect(
      lines.some((l) => l.includes('"event":"jira.projects"') && l.includes('"timeout"')),
    ).toBe(true);
  });

  it('starts both requests together instead of waiting for /myself first', async () => {
    const order: string[] = [];
    let releaseMyself: () => void = () => undefined;
    const pending = testJiraConnection(
      client({
        [MYSELF]: () => {
          order.push('myself');
          return new Promise<void>((r) => (releaseMyself = r)).then(myselfOk);
        },
        [PROJECTS]: () => {
          order.push('projects');
          return json(200, [])();
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect([...order].sort()).toEqual(['myself', 'projects']);
    releaseMyself();
    expect(await pending).toEqual({ ok: true, userDisplayName: 'Sara H', projects: [] });
  });
});
