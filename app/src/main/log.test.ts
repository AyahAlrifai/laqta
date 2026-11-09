import { describe, expect, it } from 'vitest';
import { log, scrubMeta, setLogSink } from './log';

describe('redacting logger', () => {
  it('never writes secrets, content fields or long strings', () => {
    const lines: string[] = [];
    setLogSink({ write: (l) => lines.push(l) });
    const secret = 'pat-ODk2NTQzMjEwOTg3NjU0MzIxMDpmYWtlLXRva2VuLXZhbHVl';
    log('jira.request', {
      token: secret,
      Authorization: `Bearer ${secret}`,
      header: `Bearer ${secret}`,
      prompt: 'the customer Sara Ahmad has card 4111',
      summary: 'Invoice total shown twice',
      description: 'h3. Environment',
      imageBytes: 12,
      opaque: secret,
      long: 'x'.repeat(500),
      status: 200,
      code: 'AUTH_INVALID',
    });
    const out = lines.join('\n');
    expect(out).not.toContain(secret);
    expect(out).not.toContain('Sara');
    expect(out).not.toContain('Invoice');
    expect(out).not.toContain('h3.');
    expect(out).not.toContain('x'.repeat(201));
    expect(out).toContain('"status":200');
    expect(out).toContain('AUTH_INVALID');
  });

  it('keeps short safe metadata', () => {
    expect(scrubMeta({ sessionId: 'abc', ms: 12, ok: true, none: null })).toEqual({
      sessionId: 'abc',
      ms: 12,
      ok: true,
      none: null,
    });
  });
});
