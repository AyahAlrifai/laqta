import { describe, expect, it } from 'vitest';
import { SettingsSchema, DEFAULT_SETTINGS } from '../../shared/schemas';
import { acceleratorKeycaps, recordAccelerator, type KeyPress } from './accelerator';

const press = (code: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('recordAccelerator', () => {
  it('records modifiers in a stable order followed by the key', () => {
    expect(recordAccelerator(press('KeyJ', { shiftKey: true, ctrlKey: true }), true)).toEqual({
      kind: 'accelerator',
      value: 'Control+Shift+J',
    });
  });

  it('names the Mac command key Command and the Windows key Super', () => {
    expect(recordAccelerator(press('KeyK', { metaKey: true, altKey: true }), true)).toEqual({
      kind: 'accelerator',
      value: 'Alt+Command+K',
    });
    expect(recordAccelerator(press('KeyK', { metaKey: true, altKey: true }), false)).toEqual({
      kind: 'accelerator',
      value: 'Alt+Super+K',
    });
  });

  it('uses the physical key, so digits, F-keys, Space and arrows work', () => {
    const ctrl = { ctrlKey: true };
    expect(recordAccelerator(press('Digit5', ctrl), false)).toMatchObject({ value: 'Control+5' });
    expect(recordAccelerator(press('F12', ctrl), false)).toMatchObject({ value: 'Control+F12' });
    expect(recordAccelerator(press('Space', ctrl), false)).toMatchObject({
      value: 'Control+Space',
    });
    expect(recordAccelerator(press('ArrowUp', ctrl), false)).toMatchObject({ value: 'Control+Up' });
  });

  it('keeps listening while only modifiers are held', () => {
    expect(recordAccelerator(press('ShiftLeft', { shiftKey: true }), true)).toEqual({
      kind: 'pending',
    });
  });

  it('cancels on Escape', () => {
    expect(recordAccelerator(press('Escape'), true)).toEqual({ kind: 'cancel' });
  });

  it('rejects keys without a modifier, Shift alone, and keys the schema cannot hold', () => {
    expect(recordAccelerator(press('KeyJ'), true)).toEqual({ kind: 'invalid' });
    expect(recordAccelerator(press('KeyJ', { shiftKey: true }), true)).toEqual({
      kind: 'invalid',
    });
    expect(recordAccelerator(press('Slash', { ctrlKey: true }), true)).toEqual({
      kind: 'invalid',
    });
  });

  it('only produces accelerators the settings schema accepts', () => {
    const codes = ['KeyA', 'Digit0', 'F24', 'Space', 'ArrowLeft'];
    for (const code of codes) {
      const result = recordAccelerator(press(code, { ctrlKey: true, metaKey: true }), true);
      if (result.kind !== 'accelerator') throw new Error(code);
      const parsed = SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, hotkeyArea: result.value });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('acceleratorKeycaps', () => {
  it('shows Mac symbols', () => {
    expect(acceleratorKeycaps('Control+Shift+J', true)).toEqual(['⌃', '⇧', 'J']);
    expect(acceleratorKeycaps('CommandOrControl+Alt+Up', true)).toEqual(['⌘', '⌥', '↑']);
  });

  it('shows Windows names', () => {
    expect(acceleratorKeycaps('Control+Shift+J', false)).toEqual(['Ctrl', 'Shift', 'J']);
    expect(acceleratorKeycaps('CommandOrControl+Super+W', false)).toEqual(['Ctrl', 'Win', 'W']);
  });

  it('ignores empty parts', () => {
    expect(acceleratorKeycaps('', true)).toEqual([]);
  });
});
