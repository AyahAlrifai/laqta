// Spec section 8: extra Jira labels are lower-case, `a-z0-9-` only, at most 5, and none is
// `laqta` or starts with `laqta-` (the app adds those itself). Main sanitizes model output
// with this, and the review form uses it so what the user sees is exactly what is sent.

export const MAX_EXTRA_LABELS = 5;
export const MAX_LABEL_LENGTH = 50;

/** Turns typed or model text into a label, or '' when nothing valid is left. */
export function normalizeLabel(raw: string): string {
  const label = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LABEL_LENGTH);
  return label === 'laqta' || label.startsWith('laqta-') ? '' : label;
}

/** Adds labels in order, skipping invalid ones and duplicates, up to the limit. */
export function addLabels(current: readonly string[], raws: readonly string[]): string[] {
  const out = [...current];
  for (const raw of raws) {
    if (out.length >= MAX_EXTRA_LABELS) break;
    const label = normalizeLabel(raw);
    if (label !== '' && !out.includes(label)) out.push(label);
  }
  return out;
}
