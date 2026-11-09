import { describe, expect, it } from 'vitest';
import { DICTIONARIES, format } from './strings';

describe('strings.ts', () => {
  it('Arabic and English have the same keys and placeholders', () => {
    const en = DICTIONARIES.en;
    const ar = DICTIONARIES.ar;
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(ar[key]), key).toEqual(ph(en[key]));
      expect(ar[key].trim(), key).not.toBe('');
    }
  });

  it('fills placeholders by name', () => {
    expect(format('en', 'result.created', { key: 'PROJ-1' })).toBe('Bug PROJ-1 created');
    expect(format('ar', 'result.created', { key: 'PROJ-1' })).toBe('تم إنشاء الخطأ PROJ-1');
  });
});
