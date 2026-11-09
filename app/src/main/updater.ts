import { autoUpdater } from 'electron-updater';
import { log } from './log';

// Spec section 11: generic provider on an internal https feed, check on start and every
// four hours, download in the background, install on quit. Staged rollout uses the
// `stagingPercentage` field that electron-builder writes into the feed's latest*.yml.

const FOUR_HOURS = 4 * 3_600_000;

export function startAutoUpdates(feedUrl: string | null, isPackaged: boolean): void {
  if (!isPackaged || feedUrl === null || !feedUrl.startsWith('https://')) return;
  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error: Error) => log('update.error', { name: error.name }));
  const check = () => {
    log('update.check', {});
    autoUpdater
      .checkForUpdates()
      .catch((error: unknown) =>
        log('update.error', { name: error instanceof Error ? error.name : 'unknown' }),
      );
  };
  check();
  setInterval(check, FOUR_HOURS).unref();
}

export function installUpdateNow(): void {
  autoUpdater.quitAndInstall();
}
