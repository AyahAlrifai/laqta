import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { markPermissionRestart, takePermissionRestart } from './permission-restart';

describe('permission restart marker', () => {
  it('is reported once after it is set', () => {
    const dir = mkdtempSync(join(tmpdir(), 'laqta-perm-'));
    expect(takePermissionRestart(dir)).toBe(false);
    markPermissionRestart(dir);
    expect(takePermissionRestart(dir)).toBe(true);
    expect(takePermissionRestart(dir)).toBe(false);
  });

  it('never throws when the folder is missing', () => {
    expect(() => markPermissionRestart(join(tmpdir(), 'laqta-missing', 'x'))).not.toThrow();
  });
});
