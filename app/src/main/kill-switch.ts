import { createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { StatusFileSchema, type StatusFile } from '../shared/schemas';
import type { FetchLike } from './ai/provider';
import { log } from './log';

// Spec section 11: at start the app fetches a small signed JSON (`status.json`) that can
// disable AI drafting or the whole app with a message. If the fetch fails, the app keeps
// its last known state. The envelope format (Ed25519 over the payload bytes) is the
// proposal recorded in spec section 11.1.

const EnvelopeSchema = z.object({ payload: z.string(), signature: z.string() });

const DEFAULT_STATUS: StatusFile = { aiDisabled: false, appDisabled: false };

export function verifyStatus(body: unknown, publicKeyBase64: string): StatusFile | null {
  const envelope = EnvelopeSchema.safeParse(body);
  if (!envelope.success) return null;
  try {
    const payload = Buffer.from(envelope.data.payload, 'base64');
    const key = createPublicKey({
      key: Buffer.from(publicKeyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    if (!verify(null, payload, key, Buffer.from(envelope.data.signature, 'base64'))) return null;
    const parsed = StatusFileSchema.safeParse(JSON.parse(payload.toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export class KillSwitch {
  private status: StatusFile;
  private readonly cacheFile: string;

  constructor(
    userData: string,
    private readonly url: string | null,
    private readonly publicKey: string | null,
    private readonly fetch: FetchLike,
  ) {
    this.cacheFile = join(userData, 'status-cache.json');
    this.status = this.readCache();
  }

  private readCache(): StatusFile {
    try {
      const parsed = StatusFileSchema.safeParse(JSON.parse(readFileSync(this.cacheFile, 'utf8')));
      return parsed.success ? parsed.data : DEFAULT_STATUS;
    } catch {
      return DEFAULT_STATUS;
    }
  }

  current(): StatusFile {
    return this.status;
  }

  async refresh(): Promise<StatusFile> {
    if (this.url === null || this.publicKey === null) return this.status;
    try {
      const response = await this.fetch(this.url, {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return this.status;
      const verified = verifyStatus(await response.json(), this.publicKey);
      if (verified === null) {
        log('killswitch.status', { ok: false, reason: 'signature' });
        return this.status;
      }
      this.status = verified;
      writeFileSync(this.cacheFile, JSON.stringify(verified), { mode: 0o600 });
      log('killswitch.status', { ok: true, ai: !verified.aiDisabled, app: !verified.appDisabled });
    } catch {
      // keep the last known state
    }
    return this.status;
  }
}

/** True when `current` is lower than `minimum` (both x.y.z). */
export function isBelowVersion(current: string, minimum: string): boolean {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
