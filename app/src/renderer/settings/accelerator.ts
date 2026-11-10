// Turns a key press into an Electron accelerator for the shortcut recorder, and an
// accelerator into keycaps for display. Pure, so it is unit-tested without a DOM.

export interface KeyPress {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type RecordResult =
  | { kind: 'accelerator'; value: string }
  /** Only modifiers so far: keep listening. */
  | { kind: 'pending' }
  /** A key without a modifier, or one the accelerator schema cannot hold. */
  | { kind: 'invalid' }
  | { kind: 'cancel' };

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/**
 * `event.code` names the physical key, so the result does not depend on the keyboard
 * layout (an Arabic layout still records "J"). Only letters, digits, F-keys, Space and
 * arrows are accepted: they fit the settings schema (`[A-Za-z0-9+]`) on every platform.
 */
function keyName(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] ?? null;
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1] ?? null;
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  return NAMED_KEYS[code] ?? null;
}

export function recordAccelerator(press: KeyPress, mac: boolean): RecordResult {
  if (press.code === 'Escape') return { kind: 'cancel' };
  if (MODIFIER_CODES.has(press.code)) return { kind: 'pending' };
  const key = keyName(press.code);
  // A global shortcut without a modifier would swallow that key in every app.
  const modifiers: string[] = [];
  if (press.ctrlKey) modifiers.push('Control');
  if (press.altKey) modifiers.push('Alt');
  if (press.shiftKey) modifiers.push('Shift');
  if (press.metaKey) modifiers.push(mac ? 'Command' : 'Super');
  if (key === null || modifiers.length === 0) return { kind: 'invalid' };
  // Shift alone with a letter or digit just types a character.
  if (modifiers.length === 1 && modifiers[0] === 'Shift') return { kind: 'invalid' };
  return { kind: 'accelerator', value: [...modifiers, key].join('+') };
}

const MAC_SYMBOLS: Record<string, string> = {
  Control: '⌃',
  Ctrl: '⌃',
  Alt: '⌥',
  Option: '⌥',
  Shift: '⇧',
  Command: '⌘',
  Cmd: '⌘',
  CommandOrControl: '⌘',
  CmdOrCtrl: '⌘',
  Super: '⌘',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

const WIN_NAMES: Record<string, string> = {
  Control: 'Ctrl',
  CommandOrControl: 'Ctrl',
  CmdOrCtrl: 'Ctrl',
  Super: 'Win',
  Command: 'Win',
  Cmd: 'Win',
  Option: 'Alt',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

/** Keycaps as the platform writes them: ⌃ ⇧ J on macOS, Ctrl Shift J on Windows. */
export function acceleratorKeycaps(accelerator: string, mac: boolean): string[] {
  const names = mac ? MAC_SYMBOLS : WIN_NAMES;
  return accelerator
    .split('+')
    .filter((part) => part !== '')
    .map((part) => names[part] ?? part);
}
