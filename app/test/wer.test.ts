import { describe, expect, it } from 'vitest';
import { wer, words } from '../../tools/wer/wer';

describe('word error rate (T-062)', () => {
  it('is zero for identical text and normalises Arabic variants', () => {
    expect(wer('افتح بق للفاتورة', 'افتح بق للفاتوره')).toBe(0);
    expect(words('Hello, World!')).toEqual(['hello', 'world']);
  });
  it('counts substitutions, insertions and deletions', () => {
    expect(wer('the total is shown twice', 'the total shown twice')).toBeCloseTo(0.2);
    expect(wer('a b c d', 'a x c d e')).toBeCloseTo(0.5);
  });
});
