import type { Rect } from '../../shared/types';

// Pure geometry for the capture overlay (design board 1). All values are in DIP.

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const MIN_SIZE = 4;

export interface Bounds {
  width: number;
  height: number;
}

export function normalize(ax: number, ay: number, bx: number, by: number, bounds: Bounds): Rect {
  const x1 = clamp(Math.min(ax, bx), 0, bounds.width);
  const y1 = clamp(Math.min(ay, by), 0, bounds.height);
  const x2 = clamp(Math.max(ax, bx), 0, bounds.width);
  const y2 = clamp(Math.max(ay, by), 0, bounds.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Moves the rect, keeping it fully on the display. */
export function nudge(r: Rect, dx: number, dy: number, bounds: Bounds): Rect {
  return {
    ...r,
    x: clamp(r.x + dx, 0, bounds.width - r.width),
    y: clamp(r.y + dy, 0, bounds.height - r.height),
  };
}

/** Shift + arrow keys: Right/Down grow, Left/Up shrink, from the top-left corner. */
export function resizeByKey(r: Rect, key: string, step: number, bounds: Bounds): Rect {
  let { width, height } = r;
  if (key === 'ArrowRight') width += step;
  if (key === 'ArrowLeft') width -= step;
  if (key === 'ArrowDown') height += step;
  if (key === 'ArrowUp') height -= step;
  return {
    ...r,
    width: clamp(width, MIN_SIZE, bounds.width - r.x),
    height: clamp(height, MIN_SIZE, bounds.height - r.y),
  };
}

export function resizeByHandle(
  r: Rect,
  handle: Handle,
  px: number,
  py: number,
  bounds: Bounds,
): Rect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.width;
  let bottom = r.y + r.height;
  const x = clamp(px, 0, bounds.width);
  const y = clamp(py, 0, bounds.height);
  if (handle.includes('w')) left = Math.min(x, right - MIN_SIZE);
  if (handle.includes('e')) right = Math.max(x, left + MIN_SIZE);
  if (handle.includes('n')) top = Math.min(y, bottom - MIN_SIZE);
  if (handle.includes('s')) bottom = Math.max(y, top + MIN_SIZE);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function handlePoint(r: Rect, h: Handle): { x: number; y: number } {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.width : r.x + r.width / 2;
  const y = h.includes('n') ? r.y : h.includes('s') ? r.y + r.height : r.y + r.height / 2;
  return { x, y };
}

/** Board 1: the mode bar sits under the selection and flips above it near the screen bottom. */
export function modeBarPlacement(
  r: Rect,
  bounds: Bounds,
  barHeight: number,
): 'below' | 'above' | 'inside' {
  const gap = 16;
  if (r.y + r.height + gap + barHeight <= bounds.height) return 'below';
  if (r.y - gap - barHeight >= 0) return 'above';
  return 'inside';
}

export function defaultSelection(bounds: Bounds): Rect {
  const width = Math.round(bounds.width / 3);
  const height = Math.round(bounds.height / 3);
  return {
    x: Math.round((bounds.width - width) / 2),
    y: Math.round((bounds.height - height) / 2),
    width,
    height,
  };
}

export function toPixels(r: Rect, scale: number): { width: number; height: number } {
  return { width: Math.round(r.width * scale), height: Math.round(r.height * scale) };
}
