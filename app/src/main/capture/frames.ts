import {
  desktopCapturer,
  nativeImage,
  screen,
  systemPreferences,
  type Display,
  type NativeImage,
} from 'electron';

// Spec section 5 steps 2 and 3: permission check and frozen frames, one per display, at
// full pixel size (display size times scaleFactor), matched by display_id.

export interface FrozenFrame {
  display: Display;
  image: NativeImage;
}

export function screenPermission():
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('screen');
}

export function microphonePermission():
  'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown' {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'unknown';
  return systemPreferences.getMediaAccessStatus('microphone');
}

export async function grabFrames(): Promise<Map<string, FrozenFrame>> {
  const frames = new Map<string, FrozenFrame>();
  for (const display of screen.getAllDisplays()) {
    const thumbnailSize = {
      width: Math.round(display.bounds.width * display.scaleFactor),
      height: Math.round(display.bounds.height * display.scaleFactor),
    };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
    const source =
      sources.find((s) => s.display_id === String(display.id)) ??
      (sources.length === 1 ? sources[0] : undefined);
    if (source && !source.thumbnail.isEmpty()) {
      frames.set(String(display.id), { display, image: source.thumbnail });
    }
  }
  return frames;
}

/** LAQTA_E2E=1: a deterministic noisy frame per display instead of a real screen grab. */
export function syntheticFrames(): Map<string, FrozenFrame> {
  const frames = new Map<string, FrozenFrame>();
  for (const display of screen.getAllDisplays()) {
    const width = Math.round(display.bounds.width * display.scaleFactor);
    const height = Math.round(display.bounds.height * display.scaleFactor);
    const buf = Buffer.alloc(width * height * 4);
    let seed = 12345;
    for (let i = 0; i < buf.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      buf[i] = seed & 0xff;
      buf[i + 1] = (seed >> 8) & 0xff;
      buf[i + 2] = (seed >> 16) & 0xff;
      buf[i + 3] = 255;
    }
    frames.set(String(display.id), {
      display,
      image: nativeImage.createFromBitmap(buf, { width, height }),
    });
  }
  return frames;
}
