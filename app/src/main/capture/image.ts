import { nativeImage, type NativeImage } from 'electron';
import { downscaleSteps, fitLongEdge } from './geometry';

// Image work in the main process uses Electron's NativeImage, so no native image library
// is needed (spec section 2).

export function pngSize(png: Uint8Array): { width: number; height: number } {
  const img = nativeImage.createFromBuffer(Buffer.from(png));
  return img.getSize();
}

function resizePng(png: Uint8Array, width: number, height: number): Buffer {
  return nativeImage
    .createFromBuffer(Buffer.from(png))
    .resize({ width, height, quality: 'best' })
    .toPNG();
}

/** Spec section 5: the AI gets a separate copy with the long edge at most `maxEdge`. */
export function aiCopy(png: Uint8Array, maxEdge: number): Buffer {
  const { width, height } = pngSize(png);
  const target = fitLongEdge(width, height, maxEdge);
  if (target.width === width && target.height === height) return Buffer.from(png);
  return resizePng(png, target.width, target.height);
}

/** Spec section 5: keep the attachment at most `maxBytes` by downscaling in 0.85 steps. */
export function fitAttachment(png: Uint8Array, maxBytes: number): Buffer {
  if (png.byteLength <= maxBytes) return Buffer.from(png);
  const { width, height } = pngSize(png);
  let last: Buffer = Buffer.from(png);
  for (const size of downscaleSteps(width, height)) {
    last = resizePng(png, size.width, size.height);
    if (last.byteLength <= maxBytes) return last;
  }
  return last;
}

/** One more 0.85 step, used once after Jira answers 413. */
export function shrinkOnce(png: Uint8Array): Buffer | null {
  const { width, height } = pngSize(png);
  const next = downscaleSteps(width, height).next();
  if (next.done === true) return null;
  return resizePng(png, next.value.width, next.value.height);
}

export function cropToPng(
  frame: NativeImage,
  rect: { x: number; y: number; width: number; height: number },
): Buffer {
  return frame.crop(rect).toPNG();
}
