import { mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/schemas';
import type { ReviewState } from '../../shared/types';
import { TempImages } from '../capture/temp-files';
import { OfflineDraftStore } from './offline-draft';
import { EncryptionUnavailableError, TokenStore, type Crypter } from './secrets';
import { migrateSettings, SettingsStore } from './store';

const dir = () => mkdtempSync(join(tmpdir(), 'laqta-test-'));
const xor: Crypter = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8'),
};
const unavailable: Crypter = { ...xor, isEncryptionAvailable: () => false };

describe('settings store', () => {
  it('starts with defaults and resets a corrupt file', () => {
    const d = dir();
    writeFileSync(join(d, 'settings.json'), '{not json');
    expect(new SettingsStore(d).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and drops invalid ones on migration', () => {
    expect(
      migrateSettings({ jiraBaseUrl: 'http://insecure', bugLanguage: 'ar', unknown: 1 }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      bugLanguage: 'ar',
    });
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the no-blur confirm on for settings files written before the field existed', () => {
    const older: Partial<typeof DEFAULT_SETTINGS> = { ...DEFAULT_SETTINGS };
    delete older.confirmNoBlur;
    expect(migrateSettings({ ...older, confirmNoBlur: undefined }).confirmNoBlur).toBe(true);
    expect(migrateSettings(older).confirmNoBlur).toBe(true);
    expect(migrateSettings({ ...older, confirmNoBlur: false }).confirmNoBlur).toBe(false);
  });

  it('saves and reloads', () => {
    const d = dir();
    new SettingsStore(d).set({
      ...DEFAULT_SETTINGS,
      jiraBaseUrl: 'https://jira.example.com',
      defaultProjectKey: 'PROJ',
    });
    expect(new SettingsStore(d).get().defaultProjectKey).toBe('PROJ');
  });
});

describe('token store (spec section 10)', () => {
  it('stores the token encrypted, never in plain text', () => {
    const d = dir();
    const store = new TokenStore(d, xor);
    store.set('my-secret-pat');
    expect(readFileSync(join(d, 'jira-token.bin')).toString('utf8')).not.toContain('my-secret-pat');
    expect(store.get()).toBe('my-secret-pat');
    if (process.platform !== 'win32')
      expect(statSync(join(d, 'jira-token.bin')).mode & 0o777).toBe(0o600);
  });

  it('refuses to store when encryption is unavailable', () => {
    const d = dir();
    expect(() => new TokenStore(d, unavailable).set('pat')).toThrow(EncryptionUnavailableError);
    expect(existsSync(join(d, 'jira-token.bin'))).toBe(false);
  });
});

const review: ReviewState = {
  projectKey: 'PROJ',
  bugLanguage: 'en',
  prompt: 'p',
  draft: {
    summary: 'Saved summary',
    environment: 'e',
    stepsToReproduce: [],
    actualResult: 'a',
    expectedResult: 'b',
    issueType: 'Bug',
    priority: null,
    assigneeQuery: null,
    assigneeTransliteration: null,
    labels: [],
    missingInfo: [],
  },
  assignee: null,
  extraFields: {},
};
const id = '6f1c2b8e-4d3a-4b2c-9e1f-0a1b2c3d4e5f';

describe('offline draft store (T-050)', () => {
  it('survives a restart and is encrypted at rest', () => {
    const d = dir();
    new OfflineDraftStore(d, xor).save({
      requestId: id,
      review,
      png: new Uint8Array([1, 2, 3]),
      sourceAppName: null,
      width: 1,
      height: 1,
    });
    const again = new OfflineDraftStore(d, xor);
    expect(again.list().map((x) => x.summary)).toEqual(['Saved summary']);
    expect(again.load(id)?.review.prompt).toBe('p');
    expect(readFileSync(join(d, 'offline-drafts', `${id}.bin`)).toString('utf8')).not.toContain(
      'Saved summary',
    );
  });

  it('is deleted after expiry', () => {
    const d = dir();
    let now = new Date('2026-11-09T00:00:00Z');
    const store = new OfflineDraftStore(d, xor, 24, () => now);
    store.save({
      requestId: id,
      review,
      png: new Uint8Array([1]),
      sourceAppName: null,
      width: 1,
      height: 1,
    });
    now = new Date('2026-11-10T00:00:01Z');
    expect(store.list()).toEqual([]);
    expect(existsSync(join(d, 'offline-drafts', `${id}.bin`))).toBe(false);
  });

  it('is deleted after success', () => {
    const d = dir();
    const store = new OfflineDraftStore(d, xor);
    store.save({
      requestId: id,
      review,
      png: new Uint8Array([1]),
      sourceAppName: null,
      width: 1,
      height: 1,
    });
    store.delete(id);
    expect(store.list()).toEqual([]);
  });

  it('refuses without encryption', () => {
    expect(() =>
      new OfflineDraftStore(dir(), unavailable).save({
        requestId: id,
        review,
        png: new Uint8Array([1]),
        sourceAppName: null,
        width: 1,
        height: 1,
      }),
    ).toThrow(EncryptionUnavailableError);
  });
});

describe('temp images (T-025)', () => {
  it('writes owner-only files, deletes them, and cleans up leftovers older than an hour', () => {
    const root = dir();
    const temp = new TempImages(root);
    const path = temp.write(id, new Uint8Array([9, 9, 9]));
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    temp.delete(id);
    expect(existsSync(path)).toBe(false);
    temp.write(id, new Uint8Array([1]));
    expect(temp.cleanup(3_600_000, Date.now() + 3_600_001)).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

  it('rejects path tricks in the session id', () => {
    expect(() => new TempImages(dir()).pathFor('../../etc/passwd')).toThrow();
  });
});
