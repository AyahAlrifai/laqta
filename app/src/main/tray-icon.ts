import { join } from 'node:path';

/**
 * macOS needs a monochrome template image so the menu bar can tint it for light and dark
 * mode; Electron picks up the `@2x` sibling automatically. Windows has no template concept,
 * so it gets the accent-coloured icon that reads on both light and dark taskbars.
 */
export function trayIconFileName(platform: NodeJS.Platform): string {
  return platform === 'darwin' ? 'trayTemplate.png' : 'tray.png';
}

/** In a packaged build, electron-builder copies `resources/` next to the app archive. */
export function resourcesDir(isPackaged: boolean, appPath: string, resourcesPath: string): string {
  return isPackaged ? resourcesPath : join(appPath, 'resources');
}

/**
 * Release builds are menu-bar only (`LSUIElement`). Development runs keep the Dock icon,
 * because the tray icon is easy to lose behind the notch and the Dock gives a reliable way
 * back in. E2E runs hide it so they behave like the shipped app.
 */
export function showsDockIcon(
  platform: NodeJS.Platform,
  isPackaged: boolean,
  e2e: boolean,
): boolean {
  return platform === 'darwin' && !isPackaged && !e2e;
}
