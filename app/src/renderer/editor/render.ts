import { DEFAULT_COLORS, hexToRgb, TEXT_SIZE, textOn, type Shape } from './model';
import { applyRedactions } from './redact';

// Canvas drawing for the editor. The same function draws the on-screen view and the final
// export, so what the user sees is exactly what is sent.

function drawRedactions(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Shape[],
  width: number,
  height: number,
): void {
  for (const s of shapes) {
    if (s.kind !== 'redact') continue;
    const x0 = Math.max(0, Math.floor(Math.min(s.x, s.x + s.w)));
    const y0 = Math.max(0, Math.floor(Math.min(s.y, s.y + s.h)));
    const x1 = Math.min(width, Math.ceil(Math.max(s.x, s.x + s.w)));
    const y1 = Math.min(height, Math.ceil(Math.max(s.y, s.y + s.h)));
    if (x1 <= x0 || y1 <= y0) continue;
    // Read the region from the output bitmap, overwrite it, write it back.
    const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
    applyRedactions(region.data, region.width, region.height, [
      {
        x: 0,
        y: 0,
        w: region.width,
        h: region.height,
        mode: s.mode,
        fill: hexToRgb(s.color ?? DEFAULT_COLORS.redact),
      },
    ]);
    ctx.putImageData(region, x0, y0);
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lw: number,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = lw * 4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.stroke();
}

function drawAnnotations(
  ctx: CanvasRenderingContext2D,
  shapes: readonly Shape[],
  scale: number,
): void {
  const lw = Math.max(2, Math.round(3 * scale));
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of shapes) {
    if (s.kind === 'redact') continue;
    const color = s.color ?? DEFAULT_COLORS[s.kind];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    if (s.kind === 'box') ctx.strokeRect(s.x, s.y, s.w, s.h);
    if (s.kind === 'arrow') drawArrow(ctx, s.x1, s.y1, s.x2, s.y2, lw);
    if (s.kind === 'text') {
      const size = Math.round(TEXT_SIZE * scale);
      ctx.font = `600 ${String(size)}px -apple-system, "Segoe UI", "Noto Sans Arabic", Tahoma, sans-serif`;
      const metrics = ctx.measureText(s.text);
      const padX = Math.round(8 * scale);
      const padY = Math.round(6 * scale);
      ctx.beginPath();
      ctx.roundRect(s.x, s.y, metrics.width + padX * 2, size + padY * 2, Math.round(6 * scale));
      ctx.fill();
      ctx.fillStyle = textOn(color);
      ctx.textBaseline = 'top';
      ctx.fillText(s.text, s.x + padX, s.y + padY);
    }
  }
}

/** Draws base, then overwrites redaction pixels, then draws annotations on top. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  base: CanvasImageSource,
  width: number,
  height: number,
  shapes: readonly Shape[],
  scale = 1,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(base, 0, 0, width, height);
  drawRedactions(ctx, shapes, width, height);
  drawAnnotations(ctx, shapes, scale);
}

/**
 * Spec section 5, `renderFinalPng()`: the PNG sent to the main process. Canvas export
 * carries no metadata.
 */
export async function renderFinalPng(
  base: ImageBitmap,
  shapes: readonly Shape[],
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = base.width;
  canvas.height = base.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('canvas unavailable');
  drawScene(ctx, base, base.width, base.height, shapes, Math.max(1, base.width / 1200));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (blob === null) throw new Error('export failed');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  canvas.width = 0;
  canvas.height = 0;
  return bytes;
}
