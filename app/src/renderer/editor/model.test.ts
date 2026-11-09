import { describe, expect, it } from 'vitest';
import { centredShape, commit, emptyHistory, hitTest, move, redo, undo, type Shape } from './model';

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
    expect(centredShape('redact', 400, 200, '', 'pixelate')).toMatchObject({
      kind: 'redact',
      x: 150,
      y: 75,
      w: 100,
      h: 50,
      mode: 'pixelate',
    });
  });
});
