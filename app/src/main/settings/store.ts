import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { z } from 'zod';
import { DEFAULT_SETTINGS, SettingsSchema } from '../../shared/schemas';
import type { Settings } from '../../shared/types';
import { log } from '../log';

// Spec section 10: non-secret settings in a JSON file in userData, validated on load; a
// corrupt file resets to defaults. Unknown or invalid individual fields fall back to their
// default instead of discarding the whole file (settings migration).

const FILE = 'settings.json';

export function migrateSettings(
  raw: unknown,
  schema: z.ZodType<Settings> = SettingsSchema,
): Settings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  const input = raw as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!(key in input)) continue;
    const candidate = { ...DEFAULT_SETTINGS, [key]: input[key] };
    if (schema.safeParse(candidate).success) merged[key] = input[key];
  }
  return schema.parse(merged);
}

export class SettingsStore {
  private current: Settings;
  private readonly file: string;

  /** `schema` is SettingsSchema except in E2E runs, which also accept the local mock URL. */
  constructor(
    private readonly dir: string,
    private readonly schema: z.ZodType<Settings> = SettingsSchema,
  ) {
    this.file = join(dir, FILE);
    this.current = this.load();
  }

  private load(): Settings {
    try {
      const raw: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
      const settings = migrateSettings(raw, this.schema);
      log('settings.load', { ok: true });
      return settings;
    } catch {
      log('settings.load', { ok: false });
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return { ...this.current };
  }

  set(next: Settings): Settings {
    const valid = this.schema.parse(next);
    mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(valid, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.current = valid;
    log('settings.save', { ok: true });
    return this.get();
  }
}
