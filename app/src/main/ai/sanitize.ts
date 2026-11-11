import { addLabels } from '../../shared/labels';
import type { BugDraft } from '../../shared/types';

// Spec section 7, sanitizer. Applied to every model text field after schema validation.
// Model output becomes Jira wiki markup in the description, so any markup the model (or
// text inside the screenshot, through the model) produces is neutralised here.

export const LIMITS = { summary: 120, field: 2000, step: 300, query: 100, label: 50 } as const;

// C0 and C1 controls except tab and newline, plus bidi embedding and override characters
// that can visually reorder text. LRM and RLM stay because Arabic text uses them.
// eslint-disable-next-line no-control-regex -- removing control characters is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩]/g;

export function removeControl(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(CONTROL, '');
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

const URL_PATTERN = /\b(?:https?|ftp|file|mailto|javascript|data):[^\s|\]]*/gi;

/** `[text|url]`, `[url]`, `[~user]`, `[^file]` and bare URLs, unless the URL is on Jira. */
export function removeLinks(text: string, jiraHost: string | null): string {
  const keep = (url: string) => jiraHost !== null && hostOf(url) === jiraHost;
  let out = text.replace(
    /\[([^[\]\n]*?)\|([^[\]\n]*?)\]/g,
    (match, label: string, target: string) => (keep(target.trim()) ? match : label),
  );
  out = out.replace(/\[([^[\]\n|]*)\]/g, (match, inner: string) => {
    const value = inner.trim();
    if (/^[~^#]/.test(value)) return '';
    if (/^[a-z]+:/i.test(value)) return keep(value) ? match : '';
    return match;
  });
  out = out.replace(URL_PATTERN, (url) => (keep(url) ? url : ''));
  return out;
}

export function removeImageEmbeds(text: string): string {
  return text.replace(/![^!\n\s][^!\n]*!/g, '');
}

function isKeptJiraLink(group: string, jiraHost: string | null): boolean {
  if (jiraHost === null) return false;
  const inner = group.slice(1, -1);
  const target = inner.includes('|') ? inner.slice(inner.lastIndexOf('|') + 1) : inner;
  return hostOf(target.trim()) === jiraHost;
}

function escapeMarkup(text: string, jiraHost: string | null): string {
  return text
    .replace(/[{}]/g, (c) => `\\${c}`)
    .replace(/\[[^[\]\n]*\]|[[\]]/g, (match) =>
      match.length > 1 && isKeptJiraLink(match, jiraHost)
        ? match
        : match.replace(/[[\]]/g, (c) => `\\${c}`),
    )
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)(h[1-6])\./i, '$1$2\\.')
        .replace(/^(\s*)(bq)\./i, '$1$2\\.')
        .replace(/^(\s*)([*#\-|])/, '$1\\$2'),
    )
    .join('\n');
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n(?:[ \t]*\n){3,}/g, '\n\n\n');
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  // Never leave a dangling escape backslash at the cut.
  return text.slice(0, max).replace(/\\+$/, '');
}

/** Multi-line text that ends up inside the wiki description. */
export function sanitizeWikiText(
  text: string,
  jiraHost: string | null,
  max: number = LIMITS.field,
): string {
  let out = removeControl(text);
  // Embeds first: `!http://host/x.png!` must go as a whole, not leave a stray `!`.
  out = removeImageEmbeds(out);
  out = removeLinks(out, jiraHost);
  out = escapeMarkup(out, jiraHost);
  out = collapseBlankLines(out).trim();
  return cap(out, max);
}

/** One line, plain text (the Jira summary field is not rendered as wiki markup). */
export function sanitizeSummary(text: string, jiraHost: string | null): string {
  let out = removeControl(text).replace(/\s*\n\s*/g, ' ');
  out = removeImageEmbeds(out);
  out = removeLinks(out, jiraHost);
  out = out.replace(/\s{2,}/g, ' ').trim();
  return cap(out, LIMITS.summary).trim();
}

function sanitizeLine(text: string, max: number): string {
  return cap(removeControl(text).replace(/\s+/g, ' ').trim(), max);
}

export function sanitizeLabels(labels: readonly string[]): string[] {
  return addLabels([], labels);
}

export function sanitizeDraft(draft: BugDraft, jiraHost: string | null): BugDraft {
  const text = (value: string) => sanitizeWikiText(value, jiraHost);
  const optionalLine = (value: string | null) => {
    if (value === null) return null;
    const line = sanitizeLine(value, LIMITS.query);
    return line === '' ? null : line;
  };
  return {
    summary: sanitizeSummary(draft.summary, jiraHost),
    environment: text(draft.environment),
    stepsToReproduce: draft.stepsToReproduce
      .map((step) => sanitizeWikiText(step.replace(/\n+/g, ' '), jiraHost, LIMITS.step))
      .filter((step) => step !== '')
      .slice(0, 30),
    actualResult: text(draft.actualResult),
    expectedResult: text(draft.expectedResult),
    issueType: sanitizeLine(draft.issueType, 100),
    priority: draft.priority,
    assigneeQuery: optionalLine(draft.assigneeQuery),
    assigneeTransliteration: optionalLine(draft.assigneeTransliteration),
    labels: sanitizeLabels(draft.labels),
    missingInfo: draft.missingInfo
      .map((q) => sanitizeWikiText(q.replace(/\n+/g, ' '), jiraHost, LIMITS.step))
      .filter((q) => q !== '')
      .slice(0, 5),
  };
}

/** Spec section 7: issue type and priority must come from the allowed lists. */
export function enforceAllowed(
  draft: BugDraft,
  allowed: { issueTypes: readonly string[]; priorities: readonly string[] },
): BugDraft {
  const first = allowed.issueTypes[0];
  const issueType =
    allowed.issueTypes.includes(draft.issueType) || first === undefined ? draft.issueType : first;
  const priority =
    draft.priority !== null && allowed.priorities.includes(draft.priority) ? draft.priority : null;
  return { ...draft, issueType, priority };
}
