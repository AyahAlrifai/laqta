import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppFailure, appError } from './errors';
import { guarded, type SenderInfo } from './ipc-guard';

const deps = {
  isOwnWindow: (id: number) => id === 1,
  isOwnUrl: (u: string) => u.startsWith('file:///app/'),
};
const good: SenderInfo = {
  webContentsId: 1,
  frameUrl: 'file:///app/workbench/index.html',
  isMainFrame: true,
};
const schema = z.object({ n: z.number() });

describe('IPC guard (spec section 10)', () => {
  const run = guarded('test', schema, (p) => p.n * 2, deps);

  it('passes validated payloads to the handler', async () => {
    expect(await run(good, { n: 2 })).toEqual({ ok: true, value: 4 });
  });

  it('rejects payloads with the wrong shape with a typed error', async () => {
    const r = await run(good, { n: 'two' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNKNOWN');
    expect((await run(good, undefined)).ok).toBe(false);
  });

  it('rejects senders that are not the main frame of an app window', async () => {
    expect((await run({ ...good, webContentsId: 2 }, { n: 1 })).ok).toBe(false);
    expect((await run({ ...good, isMainFrame: false }, { n: 1 })).ok).toBe(false);
    expect((await run({ ...good, frameUrl: 'https://evil.test/' }, { n: 1 })).ok).toBe(false);
    expect((await run({ ...good, frameUrl: null }, { n: 1 })).ok).toBe(false);
  });

  it('rejects a payload on a channel that takes none', async () => {
    const none = guarded('none', null, () => 1, deps);
    expect((await none(good, { sneaky: true })).ok).toBe(false);
    expect(await none(good, undefined)).toEqual({ ok: true, value: 1 });
  });

  it('returns AppFailure errors and hides other exceptions', async () => {
    const fails = guarded(
      'f',
      null,
      () => {
        throw new AppFailure(appError('FORBIDDEN'));
      },
      deps,
    );
    const r = await fails(good, undefined);
    expect(!r.ok && r.error.code).toBe('FORBIDDEN');
    const crashes = guarded(
      'c',
      null,
      () => {
        throw new Error('secret token abc');
      },
      deps,
    );
    const c = await crashes(good, undefined);
    expect(!c.ok && c.error.code).toBe('UNKNOWN');
    expect(JSON.stringify(c)).not.toContain('secret');
  });
});
