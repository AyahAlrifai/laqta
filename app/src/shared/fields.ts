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

export function shapeFieldValue(field: RequiredField, value: string): unknown {
  const [type, items] = field.schemaType.split(':');
  if (type === 'array') {
    if (field.allowedValues) return [{ id: value }];
    if (items === 'string') return [value];
    return [{ name: value }];
  }
  if (field.allowedValues) return { id: value };
  if (type === 'number') return Number(value);
  if (type === 'user') return { name: value };
  return value;
}

export function isFieldFilled(field: RequiredField, value: string | undefined): boolean {
  if (value === undefined || value.trim() === '') return false;
  if (field.allowedValues) return field.allowedValues.some((v) => v.id === value);
  if (field.schemaType === 'number') return Number.isFinite(Number(value));
  return true;
}
