import type { Rect } from '../../shared/types';

// Spec section 5 step 5: selection is in device-independent pixels; multiply by the
// display's scaleFactor to get image pixels, then clamp to the frame.

export function dipRectToPixels(
  rect: Rect,
  scaleFactor: number,
  frame: { width: number; height: number },
): Rect {
  const x = Math.round(rect.x * scaleFactor);
  const y = Math.round(rect.y * scaleFactor);
  const right = Math.round((rect.x + rect.width) * scaleFactor);
  const bottom = Math.round((rect.y + rect.height) * scaleFactor);
  const cx = Math.min(Math.max(x, 0), frame.width);
  const cy = Math.min(Math.max(y, 0), frame.height);
  const cr = Math.min(Math.max(right, 0), frame.width);
  const cb = Math.min(Math.max(bottom, 0), frame.height);
  return { x: cx, y: cy, width: Math.max(cr - cx, 0), height: Math.max(cb - cy, 0) };
}

/** Converts screen bounds of a window into the coordinates of one display. */
export function screenRectToDisplay(rect: Rect, display: Rect): Rect | null {
  const x = Math.max(rect.x, display.x);
  const y = Math.max(rect.y, display.y);
  const right = Math.min(rect.x + rect.width, display.x + display.width);
  const bottom = Math.min(rect.y + rect.height, display.y + display.height);
  if (right <= x || bottom <= y) return null;
  return { x: x - display.x, y: y - display.y, width: right - x, height: bottom - y };
}

/** Scale factor so the long edge fits `maxEdge` (spec section 5: AI copy at most 1568 px). */
export function fitLongEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= maxEdge) return { width, height };
  const scale = maxEdge / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Sizes for downscaling in 0.85 steps (spec section 5, attachment size). */
export function* downscaleSteps(
  width: number,
  height: number,
): Generator<{ width: number; height: number }> {
  let w = width;
  let h = height;
  while (w > 64 && h > 64) {
    w = Math.max(1, Math.round(w * 0.85));
    h = Math.max(1, Math.round(h * 0.85));
    yield { width: w, height: h };
  }
}
