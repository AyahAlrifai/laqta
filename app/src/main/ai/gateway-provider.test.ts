import { describe, expect, it } from 'vitest';
import { GatewayProvider } from './gateway-provider';
import type { DraftInput, FetchLike } from './provider';

const input: DraftInput = {
  imagePng: new Uint8Array([137, 80, 78, 71]),
  prompt: 'Total shown twice',
  context: { appName: null, windowTitle: null, os: 'darwin 25' },
  bugLanguage: 'en',
  allowed: { issueTypes: ['Bug'], priorities: [] },
};
const draft = {
  summary: 'Total shown twice',
  environment: '',
  stepsToReproduce: [],
  actualResult: '',
  expectedResult: '',
  issueType: 'Bug',
  priority: null,
  assigneeQuery: null,
  assigneeTransliteration: null,
  labels: [],
  missingInfo: [],
};

function respond(
  status: number,
  body: unknown,
  seen?: { init?: RequestInit; url?: string },
): FetchLike {
  return (url, init) => {
    if (seen) {
      seen.url = url;
      seen.init = init;
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
}

describe('GatewayProvider (spec section 7, T-072)', () => {
  it('posts multipart image and payload to /v1/draft and returns the draft', async () => {
    const seen: { init?: RequestInit; url?: string } = {};
    const p = new GatewayProvider({
      baseUrl: 'https://gw.example.test',
      fetch: respond(200, draft, seen),
      authHeader: () => Promise.resolve('Bearer jwt'),
    });
    expect(await p.draft(input, new AbortController().signal)).toEqual(draft);
    expect(seen.url).toBe('https://gw.example.test/v1/draft');
    const form = seen.init?.body as FormData;
    expect(form.get('image')).toBeInstanceOf(Blob);
    expect(JSON.parse(await (form.get('payload') as Blob).text())).toMatchObject({
      prompt: 'Total shown twice',
    });
    expect((seen.init?.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
  });

  it.each([
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [429, 'COST_CAP_REACHED', 'RATE_LIMITED'],
    [422, 'AI_INVALID_OUTPUT', 'AI_INVALID_OUTPUT'],
    [502, 'AI_UNAVAILABLE', 'AI_UNAVAILABLE'],
  ])('maps %s %s to %s', async (status, code, expected) => {
    const p = new GatewayProvider({
      baseUrl: 'https://gw.example.test',
      fetch: respond(status, { code }),
      authHeader: () => Promise.resolve(null),
    });
    await expect(p.draft(input, new AbortController().signal)).rejects.toMatchObject({
      error: { code: expected },
    });
  });

  it('rejects a draft that does not match the schema', async () => {
    const p = new GatewayProvider({
      baseUrl: 'https://gw.example.test',
      fetch: respond(200, { summary: '' }),
      authHeader: () => Promise.resolve(null),
    });
    await expect(p.draft(input, new AbortController().signal)).rejects.toMatchObject({
      error: { code: 'AI_INVALID_OUTPUT' },
    });
  });
});
