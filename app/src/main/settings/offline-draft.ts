import { readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { RequestIdSchema, ReviewStateSchema } from '../../shared/schemas';
import type { ReviewState, SavedDraftInfo } from '../../shared/types';
import { log } from '../log';
import type { Crypter } from './secrets';
import { EncryptionUnavailableError } from './secrets';

// Spec section 10: an offline draft (image and fields) is an encrypted blob in userData,
// deleted after a configurable period (default 24 hours) or after success.

export const DEFAULT_OFFLINE_HOURS = 24;

const SavedSchema = z.object({
  requestId: RequestIdSchema,
  savedAt: z.string(),
  expiresAt: z.string(),
  review: ReviewStateSchema,
  imagePngBase64: z.string(),
  sourceAppName: z.string().nullable(),
  width: z.number(),
  height: z.number(),
});
export type SavedDraft = z.infer<typeof SavedSchema>;

export class OfflineDraftStore {
  private readonly dir: string;

  constructor(
    userData: string,
    private readonly crypter: Crypter,
    private readonly hours: number = DEFAULT_OFFLINE_HOURS,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dir = join(userData, 'offline-drafts');
  }

  save(input: {
    requestId: string;
    review: ReviewState;
    png: Uint8Array;
    sourceAppName: string | null;
    width: number;
    height: number;
  }): SavedDraftInfo {
    if (!this.crypter.isEncryptionAvailable()) throw new EncryptionUnavailableError();
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    const savedAt = this.now();
    const expiresAt = new Date(savedAt.getTime() + this.hours * 3_600_000);
    const record: SavedDraft = {
      requestId: input.requestId,
      savedAt: savedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      review: input.review,
      imagePngBase64: Buffer.from(input.png).toString('base64'),
      sourceAppName: input.sourceAppName,
      width: input.width,
      height: input.height,
    };
    writeFileSync(this.path(input.requestId), this.crypter.encryptString(JSON.stringify(record)), {
      mode: 0o600,
    });
    log('offline.save', { requestId: input.requestId });
    return this.info(record);
  }

  private path(requestId: string): string {
    return join(this.dir, `${RequestIdSchema.parse(requestId)}.bin`);
  }

  private info(r: SavedDraft): SavedDraftInfo {
    return {
      requestId: r.requestId,
      summary: r.review.draft.summary,
      savedAt: r.savedAt,
      expiresAt: r.expiresAt,
    };
  }

  load(requestId: string): SavedDraft | null {
    try {
      const plain = this.crypter.decryptString(readFileSync(this.path(requestId)));
      const parsed = SavedSchema.safeParse(JSON.parse(plain));
      if (!parsed.success) return null;
      if (Date.parse(parsed.data.expiresAt) <= this.now().getTime()) {
        this.delete(requestId);
        return null;
      }
      return parsed.data;
    } catch {
      return null;
    }
  }

  delete(requestId: string): void {
    try {
      rmSync(this.path(requestId), { force: true });
    } catch {
      // invalid id: nothing to delete
    }
  }

  /** Removes expired or unreadable drafts and lists the rest. */
  list(): SavedDraftInfo[] {
    let files: string[];
    try {
      files = readdirSync(this.dir);
    } catch {
      return [];
    }
    const out: SavedDraftInfo[] = [];
    for (const file of files) {
      const id = file.replace(/\.bin$/, '');
      if (!RequestIdSchema.safeParse(id).success) continue;
      const draft = this.load(id);
      if (draft === null) {
        this.delete(id);
        log('offline.expire', { requestId: id });
      } else {
        out.push(this.info(draft));
      }
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
}
