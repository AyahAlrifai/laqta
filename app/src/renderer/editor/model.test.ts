import { describe, expect, it } from 'vitest';
import {
  bbox,
  centredShape,
  commit,
  emptyHistory,
  hexToRgb,
  hitTest,
  move,
  redo,
  textOn,
  undo,
  type Shape,
} from './model';

const box: Shape = { id: 'a', kind: 'box', x: 10, y: 10, w: 50, h: 40 };
const arrow: Shape = { id: 'b', kind: 'arrow', x1: 0, y1: 100, x2: 100, y2: 100 };

describe('editor model', () => {
  it('undoes and redoes commits', () => {
    let h = commit(emptyHistory(), [box]);
    h = commit(h, [box, arrow]);
    h = undo(h);
    expect(h.present).toEqual([box]);
    h = redo(h);
    expect(h.present).toEqual([box, arrow]);
    expect(undo(undo(undo(h))).present).toEqual([]);
  });

  it('a new commit clears the redo stack', () => {
    let h = commit(emptyHistory(), [box]);
    h = undo(h);
    h = commit(h, [arrow]);
    expect(redo(h).present).toEqual([arrow]);
  });

  it('hit tests boxes and thin arrows', () => {
    expect(hitTest([box, arrow], 20, 20, 4)?.id).toBe('a');
    expect(hitTest([box, arrow], 50, 103, 6)?.id).toBe('b');
    expect(hitTest([box, arrow], 300, 300, 6)).toBeNull();
  });

  it('moves shapes', () => {
    expect(move(arrow, 5, -5)).toMatchObject({ x1: 5, y1: 95, x2: 105, y2: 95 });
  });

  it('creates a centred shape for keyboard users', () => {
    expect(centredShape('redact', 400, 200, 'pixelate')).toMatchObject({
      kind: 'redact',
      x: 150,
      y: 75,
      w: 100,
      h: 50,
      mode: 'pixelate',
    });
  });

  it('picks readable label text for each colour', () => {
    expect(textOn('#D6362B')).toBe('#FFFFFF');
    expect(textOn('#14171F')).toBe('#FFFFFF');
    expect(textOn('#F5C400')).toBe('#14171F');
    expect(textOn('#FFFFFF')).toBe('#14171F');
  });

  it('falls back to black for a malformed redaction colour', () => {
    expect(hexToRgb('#2F5BEA')).toEqual([47, 91, 234]);
    expect(hexToRgb(undefined)).toEqual([0, 0, 0]);
    expect(hexToRgb('red')).toEqual([0, 0, 0]);
  });

  it('hit-tests text labels at the drawing scale', () => {
    const label: Shape = { id: 't', kind: 'text', x: 0, y: 0, text: 'Hi' };
    expect(bbox(label, 2).h).toBe(bbox(label).h * 2);
    expect(hitTest([label], 60, 60, 0, 2)?.id).toBe('t');
    expect(hitTest([label], 60, 60, 0, 1)).toBeNull();
  });
});
