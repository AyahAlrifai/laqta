import { describe, expect, it } from 'vitest';
import { applyRedactions, clipRect, pixelBlockSize, type Redaction } from './redact';

function noisyImage(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  let seed = 42;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = i % 4 === 3 ? 255 : seed >>> 24;
  }
  return data;
}

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): number[] {
  const i = (y * width + x) * 4;
  return [data[i] ?? -1, data[i + 1] ?? -1, data[i + 2] ?? -1];
}

describe('applyRedactions (spec section 5, export rule)', () => {
  const width = 200;
  const height = 120;

  it.each<Redaction['mode']>(['fill', 'pixelate'])(
    'no pixel inside a %s rectangle keeps its source value',
    (mode) => {
      const source = noisyImage(width, height);
      const out = new Uint8ClampedArray(source);
      const r: Redaction = { x: 10.4, y: 20.6, w: 90.3, h: 60.2, mode };
      applyRedactions(out, width, height, [r]);
      const { x0, y0, x1, y1 } = clipRect(r, width, height);
      let same = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (pixel(out, width, x, y).join() === pixel(source, width, x, y).join()) same++;
        }
      }
      // A noisy source makes an accidental equal pixel practically impossible.
      expect(same).toBe(0);
    },
  );

  it('leaves pixels outside every rectangle untouched', () => {
    const source = noisyImage(width, height);
    const out = new Uint8ClampedArray(source);
    applyRedactions(out, width, height, [{ x: 50, y: 50, w: 20, h: 20, mode: 'fill' }]);
    expect(pixel(out, width, 49, 49)).toEqual(pixel(source, width, 49, 49));
    expect(pixel(out, width, 70, 70)).toEqual(pixel(source, width, 70, 70));
    expect(pixel(out, width, 50, 50)).toEqual([0, 0, 0]);
  });

  it('handles rectangles drawn backwards or past the edges', () => {
    const out = noisyImage(width, height);
    applyRedactions(out, width, height, [{ x: 250, y: 150, w: -100, h: -80, mode: 'fill' }]);
    expect(pixel(out, width, width - 1, height - 1)).toEqual([0, 0, 0]);
    expect(pixel(out, width, 150, 70)).toEqual([0, 0, 0]);
  });

  it('uses pixel blocks of at least 12 px and one sixth of the shorter side', () => {
    expect(pixelBlockSize(30, 30)).toBe(12);
    expect(pixelBlockSize(600, 120)).toBe(20);
    expect(pixelBlockSize(601, 121)).toBe(21);
  });
});
