import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resourcesDir, trayIconFileName } from './tray-icon';

describe('trayIconFileName', () => {
  it('uses the template image on macOS', () => {
    expect(trayIconFileName('darwin')).toBe('trayTemplate.png');
  });

  it('uses the coloured image on Windows', () => {
    expect(trayIconFileName('win32')).toBe('tray.png');
  });
});

describe('resourcesDir', () => {
  it('reads from the app folder in development', () => {
    expect(resourcesDir(false, '/dev/app', '/pkg/res')).toBe(join('/dev/app', 'resources'));
  });

  it('reads from the packaged resources folder in a release build', () => {
    expect(resourcesDir(true, '/dev/app', '/pkg/res')).toBe('/pkg/res');
  });
});
