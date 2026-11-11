import type { Session } from 'electron';

// Chromium adds Sec-Fetch-Site/Mode/Dest to the main process's own net.fetch calls. Jira
// Cloud reads them as a sign of a browser request and applies its XSRF check to POSTs, which
// then fail with 403 (seen on create and search). Renderers never reach the network (their
// requests are blocked in windows.ts), so only requests without a webContents are touched.

export function stripBrowserHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!/^sec-fetch-/i.test(name)) out[name] = value;
  }
  return out;
}

export function installApiRequestHeaders(ses: Session): void {
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (details.webContentsId !== undefined) {
      callback({});
      return;
    }
    callback({ requestHeaders: stripBrowserHeaders(details.requestHeaders) });
  });
}
