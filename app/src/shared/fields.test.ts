import { describe, expect, it } from 'vitest';
import {
  fieldInputKind,
  isFieldFilled,
  isValidDate,
  shapeFieldValue,
  toJiraDateTime,
  type RequiredField,
} from './fields';

const field = (schemaType: string, extra: Partial<RequiredField> = {}): RequiredField => ({
  id: 'f',
  name: 'F',
  schemaType,
  ...extra,
});

describe('fieldInputKind', () => {
  it('maps Jira schema types to controls', () => {
    expect(fieldInputKind(field('date'))).toBe('date');
    expect(fieldInputKind(field('datetime'))).toBe('datetime');
    expect(fieldInputKind(field('number'))).toBe('number');
    expect(fieldInputKind(field('string'))).toBe('text');
    expect(fieldInputKind(field('option', { allowedValues: [{ id: '1', label: 'A' }] }))).toBe(
      'select',
    );
  });
});

describe('date fields (Start date, Due date)', () => {
  it('sends the picker value unchanged as yyyy-MM-dd', () => {
    expect(shapeFieldValue(field('date'), '2026-11-30')).toBe('2026-11-30');
  });

  it('accepts only real calendar days', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-02-31')).toBe(false);
    expect(isValidDate('30/11/2026')).toBe(false);
    expect(isFieldFilled(field('date'), '')).toBe(false);
    expect(isFieldFilled(field('date'), 'tomorrow')).toBe(false);
    expect(isFieldFilled(field('date'), '2026-11-30')).toBe(true);
  });
});

describe('datetime fields', () => {
  it('adds seconds, millis and the local offset Jira needs', () => {
    const out = toJiraDateTime('2026-11-30T09:05');
    expect(out).toMatch(/^2026-11-30T09:05:00\.000[+-]\d{4}$/);
    const offset = -new Date(2026, 10, 30, 9, 5).getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.trunc(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    expect(out.endsWith(`${sign}${hh}${mm}`)).toBe(true);
    expect(shapeFieldValue(field('datetime'), '2026-11-30T09:05')).toBe(out);
  });

  it('requires a full, valid date and time', () => {
    expect(isFieldFilled(field('datetime'), '2026-11-30')).toBe(false);
    expect(isFieldFilled(field('datetime'), '2026-11-30T25:00')).toBe(false);
    expect(isFieldFilled(field('datetime'), '2026-11-30T09:05')).toBe(true);
  });
});
