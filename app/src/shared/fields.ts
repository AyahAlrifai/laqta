import type { CreateMeta } from './types';

// Shapes the reporter's input for a required field into the value Jira expects, using the
// schema type and allowed values from CreateMeta (spec section 8, create body).

export type RequiredField = CreateMeta['requiredFields'][number];

/** Fields the app fills itself; a required field with one of these ids is not asked for. */
export const HANDLED_FIELDS = new Set([
  'project',
  'issuetype',
  'summary',
  'description',
  'reporter',
  'priority',
  'assignee',
  'labels',
  'attachment',
]);

export const EXTRA_FIELD_ID = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;

/** Which control the Review step shows for a required field. */
export type FieldInputKind = 'select' | 'date' | 'datetime' | 'number' | 'text';

export function fieldInputKind(field: RequiredField): FieldInputKind {
  if (field.allowedValues) return 'select';
  if (field.schemaType === 'date') return 'date';
  if (field.schemaType === 'datetime') return 'datetime';
  if (field.schemaType === 'number') return 'number';
  return 'text';
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** A real calendar day as `<input type="date">` gives it (rejects 2026-02-31). */
export function isValidDate(value: string): boolean {
  const m = DATE.exec(value);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function isValidDateTimeLocal(value: string): boolean {
  const m = DATETIME_LOCAL.exec(value);
  if (m === null) return false;
  const [hh, mm] = [Number(m[4]), Number(m[5])];
  return isValidDate(value.slice(0, 10)) && hh < 24 && mm < 60;
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

/**
 * `<input type="datetime-local">` gives local wall-clock time without a zone. Jira's REST v2
 * wants `yyyy-MM-dd'T'HH:mm:ss.SSSZ`, so the reporter's own UTC offset is appended; without
 * it Jira would read the time in the server's zone and shift it.
 */
export function toJiraDateTime(value: string): string {
  const m = DATETIME_LOCAL.exec(value);
  if (m === null) return value;
  const local = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? '0'),
  );
  const offset = -local.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const zone = `${sign}${pad(Math.trunc(offset / 60))}${pad(offset % 60)}`;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.000${zone}`;
}

export function shapeFieldValue(field: RequiredField, value: string): unknown {
  const [type, items] = field.schemaType.split(':');
  if (type === 'array') {
    if (field.allowedValues) return [{ id: value }];
    if (items === 'string') return [value];
    return [{ name: value }];
  }
  if (field.allowedValues) return { id: value };
  if (type === 'number') return Number(value);
  // Jira date fields take `yyyy-MM-dd`, which is exactly what the date input gives.
  if (type === 'date') return value;
  if (type === 'datetime') return toJiraDateTime(value);
  if (type === 'user') return { name: value };
  return value;
}

export function isFieldFilled(field: RequiredField, value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  if (field.allowedValues) return field.allowedValues.some((v) => v.id === value);
  if (field.schemaType === 'number') return Number.isFinite(Number(value));
  if (field.schemaType === 'date') return isValidDate(value);
  if (field.schemaType === 'datetime') return isValidDateTimeLocal(value);
  return true;
}
