import { globalShortcut } from 'electron';
import type { CaptureMode } from '../shared/types';
import { log } from './log';

// Spec section 13, T-020: register the capture hotkeys and report conflicts.

export interface HotkeyBinding {
  accelerator: string;
  mode: CaptureMode;
}

/** Returns the accelerators that could not be registered (taken by another app or invalid). */
export function registerHotkeys(
  bindings: readonly HotkeyBinding[],
  onPress: (mode: CaptureMode) => void,
): string[] {
  globalShortcut.unregisterAll();
  const conflicts: string[] = [];
  for (const binding of bindings) {
    if (binding.accelerator === '') continue;
    let ok: boolean;
    try {
      ok = globalShortcut.register(binding.accelerator, () => onPress(binding.mode));
    } catch {
      ok = false;
    }
    log(ok ? 'hotkey.register' : 'hotkey.conflict', {
      accelerator: binding.accelerator,
      mode: binding.mode,
    });
    if (!ok) conflicts.push(binding.accelerator);
  }
  return conflicts;
}

const ESCAPE = 'Escape';

/**
 * While the capture overlay is up, Esc must cancel even before the user clicks: a menu-bar
 * app is not always made key on macOS, so the overlay page may not receive keyboard events.
 * A global shortcut does not depend on focus. It is removed as soon as the overlay closes.
 */
export function registerCaptureEscape(onEscape: () => void): void {
  if (globalShortcut.isRegistered(ESCAPE)) return;
  try {
    globalShortcut.register(ESCAPE, onEscape);
  } catch {
    // The overlay's own key handler still works once it has focus.
  }
}

export function unregisterCaptureEscape(): void {
  if (globalShortcut.isRegistered(ESCAPE)) globalShortcut.unregister(ESCAPE);
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}

/** Display form of an accelerator for menus, per platform. */
export function displayAccelerator(accelerator: string, platform: string): string {
  const mac = platform === 'darwin';
  return accelerator
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return mac ? '⌘' : 'Ctrl';
      if (part === 'Shift') return mac ? '⇧' : 'Shift';
      if (part === 'Alt' || part === 'Option') return mac ? '⌥' : 'Alt';
      if (part === 'Control' || part === 'Ctrl') return mac ? '⌃' : 'Ctrl';
      return part;
    })
    .join(mac ? '' : '+');
}
