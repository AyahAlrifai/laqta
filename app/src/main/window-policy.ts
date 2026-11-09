// Pure parts of the window hardening in spec section 10, kept free of Electron imports so
// they can be unit tested.

export type WindowKind = 'overlay' | 'workbench' | 'toast' | 'settings';

export const HARDENED_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webviewTag: false,
  spellcheck: false,
} as const;

export const CONTENT_SECURITY_POLICY =
  "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'none'";

/**
 * Deny every permission except the microphone for the workbench window when voice is on
 * (spec section 10). `media` requests must ask for audio only.
 */
export function permissionDecision(
  permission: string,
  kind: WindowKind | undefined,
  voiceEnabled: boolean,
  mediaTypes: readonly string[] = [],
): boolean {
  if (permission !== 'media') return false;
  if (kind !== 'workbench' || !voiceEnabled) return false;
  return mediaTypes.length > 0 && mediaTypes.every((m) => m === 'audio');
}

/** Renderer pages are served from the dev server in development and from files in a build. */
export function isAppUrl(
  url: string,
  devServerUrl: string | undefined,
  rendererDir: string,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (devServerUrl) {
    const dev = new URL(devServerUrl);
    if (parsed.origin === dev.origin) return true;
  }
  if (parsed.protocol !== 'file:') return false;
  const path = decodeURIComponent(parsed.pathname).replace(/\\/g, '/');
  const root = rendererDir.replace(/\\/g, '/');
  const normalisedRoot = root.startsWith('/') ? root : `/${root}`;
  return path.startsWith(normalisedRoot.endsWith('/') ? normalisedRoot : `${normalisedRoot}/`);
}
