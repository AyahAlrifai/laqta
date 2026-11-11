// Annotation and redaction model for the editor (spec section 5). Coordinates are in
// image pixels. Pure functions so undo, redo and hit testing are unit tested.

export type RedactionMode = 'fill' | 'pixelate';

// `color` is a hex from ANNOTATION_COLORS. It is optional so shapes made before colours
// existed (and the unit-test fixtures) still draw, in the default red.
export type Shape =
  | { id: string; kind: 'box'; x: number; y: number; w: number; h: number; color?: string }
  | { id: string; kind: 'arrow'; x1: number; y1: number; x2: number; y2: number; color?: string }
  | { id: string; kind: 'text'; x: number; y: number; text: string; color?: string }
  | {
      id: string;
      kind: 'redact';
      x: number;
      y: number;
      w: number;
      h: number;
      mode: RedactionMode;
      color?: string;
    };

export type ShapeKind = Shape['kind'];

/** The colour choices offered for every shape type. The first is each type's default. */
export const ANNOTATION_COLORS = [
  '#D6362B',
  '#F08C00',
  '#F5C400',
  '#1F9D55',
  '#2F5BEA',
  '#8B3FD9',
  '#14171F',
  '#FFFFFF',
] as const;

/** Solid redactions default to black, the other shapes to red. */
export const DEFAULT_COLORS: Record<ShapeKind, string> = {
  box: '#D6362B',
  arrow: '#D6362B',
  text: '#D6362B',
  redact: '#14171F',
};

export const MAX_LABEL_CHARS = 80;

export type Tool = 'select' | 'box' | 'arrow' | 'text' | 'redact';

export interface History {
  past: Shape[][];
  present: Shape[];
  future: Shape[][];
}

export const emptyHistory = (): History => ({ past: [], present: [], future: [] });

export function commit(h: History, next: Shape[]): History {
  return { past: [...h.past, h.present].slice(-100), present: next, future: [] };
}

export function undo(h: History): History {
  const previous = h.past[h.past.length - 1];
  if (previous === undefined) return h;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo(h: History): History {
  const next = h.future[0];
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}

let counter = 0;
export function newId(): string {
  counter += 1;
  return `s${String(counter)}`;
}

export const TEXT_SIZE = 22;

export function textWidth(text: string, scale = 1): number {
  return (Math.max(TEXT_SIZE, text.length * TEXT_SIZE * 0.6) + 16) * scale;
}

/** `scale` is the editor's drawing scale; text labels are drawn that much larger. */
export function bbox(s: Shape, scale = 1): { x: number; y: number; w: number; h: number } {
  switch (s.kind) {
    case 'box':
    case 'redact':
      return { x: s.x, y: s.y, w: s.w, h: s.h };
    case 'arrow':
      return {
        x: Math.min(s.x1, s.x2),
        y: Math.min(s.y1, s.y2),
        w: Math.abs(s.x2 - s.x1),
        h: Math.abs(s.y2 - s.y1),
      };
    case 'text':
      return { x: s.x, y: s.y, w: textWidth(s.text, scale), h: (TEXT_SIZE + 12) * scale };
  }
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Topmost shape under the point, with a tolerance for thin shapes. */
export function hitTest(
  shapes: readonly Shape[],
  x: number,
  y: number,
  tolerance: number,
  scale = 1,
): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s === undefined) continue;
    if (s.kind === 'arrow') {
      if (distanceToSegment(x, y, s.x1, s.y1, s.x2, s.y2) <= tolerance) return s;
      continue;
    }
    const b = bbox(s, scale);
    if (
      x >= b.x - tolerance &&
      x <= b.x + b.w + tolerance &&
      y >= b.y - tolerance &&
      y <= b.y + b.h + tolerance
    ) {
      return s;
    }
  }
  return null;
}

export function move(s: Shape, dx: number, dy: number): Shape {
  if (s.kind === 'arrow')
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { ...s, x: s.x + dx, y: s.y + dy };
}

/** Default shape for keyboard creation (Enter): centred, a quarter of the image. */
export function centredShape(
  tool: Exclude<Tool, 'select' | 'text'>,
  width: number,
  height: number,
  mode: RedactionMode,
  color?: string,
): Shape {
  const w = Math.max(Math.round(width / 4), 24);
  const h = Math.max(Math.round(height / 4), 24);
  const x = Math.round((width - w) / 2);
  const y = Math.round((height - h) / 2);
  const id = newId();
  switch (tool) {
    case 'box':
      return { id, kind: 'box', x, y, w, h, color };
    case 'redact':
      return { id, kind: 'redact', x, y, w, h, mode, color };
    case 'arrow':
      return { id, kind: 'arrow', x1: x, y1: y + h, x2: x + w, y2: y, color };
  }
}

/** Readable text colour on a filled label: dark on light colours, white on dark ones. */
export function textOn(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#14171F' : '#FFFFFF';
}

/** Hex `#RRGGBB` to RGB, black when malformed (a redaction must always overwrite pixels). */
export function hexToRgb(hex: string | undefined): [number, number, number] {
  if (hex === undefined || !/^#[0-9a-fA-F]{6}$/.test(hex)) return [0, 0, 0];
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function counts(shapes: readonly Shape[]): {
  boxes: number;
  arrows: number;
  texts: number;
  blurs: number;
} {
  return {
    boxes: shapes.filter((s) => s.kind === 'box').length,
    arrows: shapes.filter((s) => s.kind === 'arrow').length,
    texts: shapes.filter((s) => s.kind === 'text').length,
    blurs: shapes.filter((s) => s.kind === 'redact').length,
  };
}
