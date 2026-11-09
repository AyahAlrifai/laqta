import type { RedactionMode } from './model';

// Spec section 5, export rule (security critical). Redactions overwrite the pixels of the
// output bitmap; nothing is drawn "on top", so the original values cannot be recovered from
// the exported PNG.

export interface Redaction {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: RedactionMode;
}

/** At least 12 px and at least one sixth of the shorter side of the rectangle. */
export function pixelBlockSize(w: number, h: number): number {
  return Math.max(12, Math.ceil(Math.min(w, h) / 6));
}

/** Integer pixel bounds, rounded outwards and clipped to the image. */
export function clipRect(
  r: Redaction,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.max(0, Math.floor(Math.min(r.x, r.x + r.w)));
  const y0 = Math.max(0, Math.floor(Math.min(r.y, r.y + r.h)));
  const x1 = Math.min(width, Math.ceil(Math.max(r.x, r.x + r.w)));
  const y1 = Math.min(height, Math.ceil(Math.max(r.y, r.y + r.h)));
  return { x0, y0, x1, y1 };
}

/** Overwrites, in place, every pixel inside each redaction rectangle (RGBA, row-major). */
export function applyRedactions(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  redactions: readonly Redaction[],
): void {
  for (const r of redactions) {
    const { x0, y0, x1, y1 } = clipRect(r, width, height);
    if (x1 <= x0 || y1 <= y0) continue;
    if (r.mode === 'fill') {
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
      continue;
    }
    const block = pixelBlockSize(x1 - x0, y1 - y0);
    for (let by = y0; by < y1; by += block) {
      for (let bx = x0; bx < x1; bx += block) {
        const ex = Math.min(bx + block, x1);
        const ey = Math.min(by + block, y1);
        let r0 = 0;
        let g0 = 0;
        let b0 = 0;
        let n = 0;
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * width + x) * 4;
            r0 += data[i] ?? 0;
            g0 += data[i + 1] ?? 0;
            b0 += data[i + 2] ?? 0;
            n++;
          }
        }
        const rr = Math.round(r0 / n);
        const gg = Math.round(g0 / n);
        const bb = Math.round(b0 / n);
        for (let y = by; y < ey; y++) {
          for (let x = bx; x < ex; x++) {
            const i = (y * width + x) * 4;
            data[i] = rr;
            data[i + 1] = gg;
            data[i + 2] = bb;
            data[i + 3] = 255;
          }
        }
      }
    }
  }
}
