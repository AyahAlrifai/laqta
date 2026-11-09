import {
  chmodSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { RequestIdSchema } from '../../shared/schemas';
import { log } from '../log';

// Spec section 10: the temporary screenshot is `<temp>/laqta/<sessionId>.png` with
// owner-only permissions, deleted on done, discard or quit, and on start-up for leftovers
// older than one hour.

export const LEFTOVER_MAX_AGE_MS = 3_600_000;

export class TempImages {
  readonly dir: string;

  constructor(tempRoot: string) {
    this.dir = join(tempRoot, 'laqta');
  }

  pathFor(sessionId: string): string {
    return join(this.dir, `${RequestIdSchema.parse(sessionId)}.png`);
  }

  write(sessionId: string, png: Uint8Array): string {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const file = this.pathFor(sessionId);
    writeFileSync(file, png, { mode: 0o600 });
    chmodSync(file, 0o600);
    return file;
  }

  read(sessionId: string): Buffer {
    return readFileSync(this.pathFor(sessionId));
  }

  /** Overwrites the file with zeros before removing it, so the bytes do not linger. */
  delete(sessionId: string): void {
    const file = this.pathFor(sessionId);
    try {
      const size = statSync(file).size;
      writeFileSync(file, Buffer.alloc(size));
    } catch {
      // already gone
    }
    rmSync(file, { force: true });
  }

  cleanup(maxAgeMs: number, now: number = Date.now()): number {
    let removed = 0;
    let files: string[];
    try {
      files = readdirSync(this.dir);
    } catch {
      return 0;
    }
    for (const name of files) {
      const file = join(this.dir, name);
      try {
        if (now - statSync(file).mtimeMs >= maxAgeMs) {
          rmSync(file, { force: true });
          removed++;
        }
      } catch {
        // raced with another delete
      }
    }
    log('tempfiles.cleanup', { removed });
    return removed;
  }
}
