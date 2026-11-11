import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// macOS only applies a new Screen Recording grant after the app restarts. Whether the restart
// comes from System Settings ("Quit & Reopen") or from our own Restart button, Laqta comes
// back as a menu-bar app with no window, which looks as if it never reopened. A marker file
// written before the restart tells the next start to open Settings so the user sees it.

const MARKER = 'permission-restart.flag';

export function markPermissionRestart(userData: string): void {
  try {
    writeFileSync(join(userData, MARKER), '');
  } catch {
    // Best effort: without the marker Laqta still restarts, it just starts in the tray.
  }
}

/** True once per marker: reading it removes it. */
export function takePermissionRestart(userData: string): boolean {
  const path = join(userData, MARKER);
  if (!existsSync(path)) return false;
  rmSync(path, { force: true });
  return true;
}
