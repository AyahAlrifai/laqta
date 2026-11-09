import { join } from 'node:path';
import { BrowserWindow, session, shell, type Rectangle } from 'electron';
import { log } from './log';
import {
  HARDENED_WEB_PREFERENCES,
  isAppUrl,
  permissionDecision,
  type WindowKind,
} from './window-policy';

// One factory for every window (spec section 10). Nothing else in the app calls
// `new BrowserWindow`.

const PRELOAD_PATH = join(__dirname, '../preload/index.js');
export const RENDERER_DIR = join(__dirname, '../renderer');

const kinds = new Map<number, WindowKind>();

export function windowKindOf(webContentsId: number): WindowKind | undefined {
  return kinds.get(webContentsId);
}

export function isOwnRendererUrl(url: string): boolean {
  return isAppUrl(url, process.env.ELECTRON_RENDERER_URL, RENDERER_DIR);
}

let voiceEnabled = false;
export function setVoicePermission(enabled: boolean): void {
  voiceEnabled = enabled;
}

/** Called once at start-up: applies to every renderer in the default session. */
export function installSessionPolicy(): void {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : [];
    callback(permissionDecision(permission, kinds.get(wc.id), voiceEnabled, mediaTypes));
  });
  ses.setPermissionCheckHandler((wc, permission) =>
    wc ? permissionDecision(permission, kinds.get(wc.id), voiceEnabled, ['audio']) : false,
  );
  // Renderers have connect-src 'none'; this also blocks anything the CSP would miss. Requests
  // without a webContents are the main process's own `net.fetch` calls and pass through.
  ses.webRequest.onBeforeRequest((details, callback) => {
    if (details.webContentsId === undefined) {
      callback({});
      return;
    }
    const url = details.url;
    const ok =
      isOwnRendererUrl(url) ||
      url.startsWith('devtools://') ||
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      (process.env.ELECTRON_RENDERER_URL !== undefined && url.startsWith('ws://localhost'));
    callback({ cancel: !ok });
  });
}

export interface WindowOptions {
  kind: WindowKind;
  bounds?: Rectangle;
  width?: number;
  height?: number;
  title: string;
  rtl?: boolean;
}

export function createAppWindow(opts: WindowOptions): BrowserWindow {
  const overlay = opts.kind === 'overlay';
  const toast = opts.kind === 'toast';
  const win = new BrowserWindow({
    title: opts.title,
    show: false,
    width: opts.width ?? 1100,
    height: opts.height ?? 720,
    ...(opts.bounds ?? {}),
    minWidth: overlay || toast ? undefined : 760,
    minHeight: overlay || toast ? undefined : 560,
    frame: !overlay && !toast,
    transparent: overlay,
    resizable: !overlay && !toast,
    movable: !overlay,
    hasShadow: !overlay,
    skipTaskbar: overlay || toast,
    alwaysOnTop: overlay || toast,
    fullscreenable: false,
    enableLargerThanScreen: overlay,
    backgroundColor: overlay ? '#00000000' : '#FFFFFF',
    autoHideMenuBar: true,
    webPreferences: { ...HARDENED_WEB_PREFERENCES, preload: PRELOAD_PATH },
  });

  const id = win.webContents.id;
  kinds.set(id, opts.kind);
  win.on('closed', () => kinds.delete(id));

  if (overlay) {
    win.setAlwaysOnTop(true, 'screen-saver');
    // Above full-screen apps on macOS (spec section 5 step 4).
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  if (toast) win.setAlwaysOnTop(true, 'floating');

  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    if (!isOwnRendererUrl(url) || url !== wc.getURL()) event.preventDefault();
  });
  wc.on('will-redirect', (event) => event.preventDefault());
  wc.on('will-attach-webview', (event) => event.preventDefault());

  loadPage(win, opts.kind);
  return win;
}

function loadPage(win: BrowserWindow, kind: WindowKind): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  const promise = devUrl
    ? win.loadURL(`${devUrl}/${kind}/index.html`)
    : win.loadFile(join(RENDERER_DIR, kind, 'index.html'));
  promise.catch((error: unknown) => {
    log('app.error', {
      where: 'loadPage',
      kind,
      name: error instanceof Error ? error.name : 'unknown',
    });
  });
}

/** Opens an external URL that the caller has already validated with `links.ts`. */
export async function openValidatedExternal(url: string): Promise<void> {
  await shell.openExternal(url, { activate: true });
}
