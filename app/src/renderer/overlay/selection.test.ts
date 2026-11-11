import { describe, expect, it } from 'vitest';
import {
  clampBar,
  modeBarPlacement,
  normalize,
  nudge,
  resizeByHandle,
  resizeByKey,
  toPixels,
} from './selection';

const bounds = { width: 1000, height: 800 };

describe('overlay selection', () => {
  it('normalises a drag in any direction and clamps it to the display', () => {
    expect(normalize(300, 200, 100, 50, bounds)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    });
    expect(normalize(-50, -50, 2000, 2000, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    });
  });

  it('nudges without leaving the display', () => {
    const r = { x: 0, y: 0, width: 100, height: 100 };
    expect(nudge(r, -10, -10, bounds)).toEqual(r);
    expect(nudge(r, 5, 6, bounds)).toEqual({ x: 5, y: 6, width: 100, height: 100 });
    expect(nudge({ ...r, x: 899 }, 10, 0, bounds).x).toBe(900);
  });

  it('Shift resizes with the arrow keys and never below the minimum', () => {
    const r = { x: 10, y: 10, width: 100, height: 100 };
    expect(resizeByKey(r, 'ArrowRight', 10, bounds).width).toBe(110);
    expect(resizeByKey(r, 'ArrowUp', 10, bounds).height).toBe(90);
    expect(resizeByKey({ ...r, width: 5 }, 'ArrowLeft', 10, bounds).width).toBe(4);
  });

  it('resizes from every handle', () => {
    const r = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeByHandle(r, 'se', 400, 300, bounds)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 200,
    });
    expect(resizeByHandle(r, 'nw', 50, 60, bounds)).toEqual({
      x: 50,
      y: 60,
      width: 250,
      height: 140,
    });
    expect(resizeByHandle(r, 'n', 999, 0, bounds)).toEqual({
      x: 100,
      y: 0,
      width: 200,
      height: 200,
    });
    expect(resizeByHandle(r, 'w', 999, 999, bounds).width).toBe(4);
  });

  it('flips the mode bar above the selection near the bottom of the screen', () => {
    expect(modeBarPlacement({ x: 0, y: 100, width: 10, height: 100 }, bounds, 80)).toBe('below');
    expect(modeBarPlacement({ x: 0, y: 600, width: 10, height: 150 }, bounds, 80)).toBe('above');
    expect(modeBarPlacement({ x: 0, y: 0, width: 10, height: 800 }, bounds, 80)).toBe('inside');
  });

  it('reports the size in image pixels at 150 percent scaling', () => {
    expect(toPixels({ x: 0, y: 0, width: 640, height: 280 }, 1.5)).toEqual({
      width: 960,
      height: 420,
    });
  });

  it('keeps a dragged mode bar on screen', () => {
    const size = { width: 300, height: 48 };
    expect(clampBar({ x: -50, y: -10 }, size, bounds)).toEqual({ x: 8, y: 8 });
    expect(clampBar({ x: 900, y: 790 }, size, bounds)).toEqual({ x: 692, y: 744 });
    expect(clampBar({ x: 200, y: 300 }, size, bounds)).toEqual({ x: 200, y: 300 });
  });
});
