import { screen } from 'electron';
import type { Rect } from '../../shared/types';

// Spec section 5 step 6. The `active-win` package named in the spec was renamed to
// `get-windows` (same author, same API); see spec section 2.1. If it or its permission is
// unavailable, window mode is hidden.

export interface ActiveWindowInfo {
  appName: string;
  title: string;
  /** Screen bounds in device-independent pixels. */
  bounds: Rect;
}

interface GetWindowsResult {
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  owner: { name: string };
}

export async function readActiveWindow(): Promise<ActiveWindowInfo | null> {
  try {
    const mod = (await import('get-windows')) as {
      activeWindow: (opts?: {
        accessibilityPermission?: boolean;
        screenRecordingPermission?: boolean;
      }) => Promise<GetWindowsResult | undefined>;
    };
    // Never trigger macOS permission prompts from here; missing permission just hides the mode.
    const win = await mod.activeWindow({
      accessibilityPermission: false,
      screenRecordingPermission: false,
    });
    if (!win) return null;
    let bounds: Rect = { ...win.bounds };
    if (process.platform === 'win32') {
      // The Windows helper reports physical pixels; convert to DIP like every other rect.
      bounds = screen.screenToDipRect(null, bounds);
    }
    return { appName: win.owner.name.slice(0, 100), title: win.title.slice(0, 200), bounds };
  } catch {
    return null;
  }
}
