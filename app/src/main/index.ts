import { join } from 'node:path';
import { app } from 'electron';
import { LaqtaApp } from './app';
import type { DraftProvider } from './ai/provider';
import { fileSink, log, setLogSink } from './log';
import { showsDockIcon } from './tray-icon';
import { installSessionPolicy } from './windows';

// App lifecycle (spec section 2): single-instance lock, tray, start-up and quit.

if (process.env.LAQTA_E2E === '1' && !app.isPackaged && process.env.LAQTA_E2E_USER_DATA) {
  app.setPath('userData', process.env.LAQTA_E2E_USER_DATA);
}

declare const __LAQTA_DEV_PROVIDER__: boolean;

/**
 * The direct Anthropic provider exists only in development builds. The flag is replaced at
 * build time, so release bundles drop this import and never contain the key name.
 */
async function loadDevProvider(): Promise<(() => DraftProvider | null) | null> {
  if (!__LAQTA_DEV_PROVIDER__) return null;
  const mod = await import('./ai/dev-provider');
  return mod.createDevProvider;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let laqta: LaqtaApp | null = null;
  app.on('second-instance', () => laqta?.focusOrSettings());
  // Laqta lives in the tray, so closing its windows must not quit the app.
  app.on('window-all-closed', () => undefined);
  // Clicking the Dock icon (development runs only) acts like the tray click. Activation with
  // a window already showing (switching apps mid-session) must not pull Settings on top.
  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) laqta?.focusOrSettings();
  });
  app.on('before-quit', () => {
    log('app.quit', {});
    laqta?.shutdown();
  });

  void app.whenReady().then(async () => {
    setLogSink(fileSink(join(app.getPath('userData'), 'logs')));
    log('app.start', { version: app.getVersion(), platform: process.platform });
    const e2e = process.env.LAQTA_E2E === '1';
    if (process.platform === 'darwin' && !showsDockIcon(process.platform, app.isPackaged, e2e)) {
      app.dock?.hide();
    }
    installSessionPolicy();
    laqta = new LaqtaApp(await loadDevProvider());
    await laqta.start();
  });
}
