import { describe, expect, it } from 'vitest';
import { addLabels, MAX_EXTRA_LABELS, normalizeLabel } from './labels';

describe('normalizeLabel', () => {
  it('lower-cases, turns spaces into hyphens and drops other characters', () => {
    expect(normalizeLabel('  UI Bug ')).toBe('ui-bug');
    expect(normalizeLabel('billing!')).toBe('billing');
    expect(normalizeLabel('a -- b')).toBe('a-b');
  });

  it('rejects what Jira or the app would not accept', () => {
    expect(normalizeLabel('فاتورة')).toBe('');
    expect(normalizeLabel('---')).toBe('');
    expect(normalizeLabel('laqta')).toBe('');
    expect(normalizeLabel('LAQTA-1234')).toBe('');
  });
});

describe('addLabels', () => {
  it('keeps order, skips duplicates and invalid ones', () => {
    expect(addLabels(['ui'], ['Billing', 'ui', '!!', 'checkout'])).toEqual([
      'ui',
      'billing',
      'checkout',
    ]);
  });

  it('stops at the limit', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(addLabels([], many)).toHaveLength(MAX_EXTRA_LABELS);
  });
});
