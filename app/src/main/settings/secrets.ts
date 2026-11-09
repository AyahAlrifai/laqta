import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { log } from '../log';

// Spec section 10: the PAT is encrypted with safeStorage and kept as a blob in userData.
// It is never logged, never sent to a renderer and never sent to the gateway. If encryption
// is not available, the token is refused rather than stored in plain text.

export interface Crypter {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class EncryptionUnavailableError extends Error {
  constructor() {
    super('encryption unavailable');
    this.name = 'EncryptionUnavailableError';
  }
}

export class TokenStore {
  private readonly file: string;

  constructor(
    dir: string,
    private readonly crypter: Crypter,
  ) {
    this.file = join(dir, 'jira-token.bin');
  }

  available(): boolean {
    return this.crypter.isEncryptionAvailable();
  }

  has(): boolean {
    return existsSync(this.file);
  }

  set(token: string): void {
    if (!this.available()) {
      log('secrets.unavailable', {});
      throw new EncryptionUnavailableError();
    }
    writeFileSync(this.file, this.crypter.encryptString(token), { mode: 0o600 });
  }

  get(): string | null {
    if (!this.has() || !this.available()) return null;
    try {
      return this.crypter.decryptString(readFileSync(this.file));
    } catch {
      return null;
    }
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}
