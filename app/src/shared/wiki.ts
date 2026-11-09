// Spec section 8, description builder. The app builds the description from the approved
// fields; it is never taken from the model as one string. Field text has already been
// neutralised by the sanitizer (model output) or comes from the reporter's own edits.

export interface DescriptionFields {
  requestId: string;
  environment: string;
  stepsToReproduce: string[];
  actualResult: string;
  expectedResult: string;
  appName: string | null;
}

/** Escapes wiki markup in text the reporter typed, so their words render as written. */
export function escapeUserWiki(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/(?<!\\)([{}[\]!])/g, '\\$1')
    .split('\n')
    .map((line) =>
      line.replace(/^(\s*)(h[1-6]|bq)\./i, '$1$2\\.').replace(/^(\s*)([*#\-|])/, '$1\\$2'),
    )
    .join('\n')
    .trim();
}

function block(text: string): string {
  return text.trim() === '' ? '_Not provided_' : text.trim();
}

export function attachmentFileName(requestId: string): string {
  return `laqta-${requestId}.png`;
}

export function buildDescriptionWiki(f: DescriptionFields): string {
  const steps = f.stepsToReproduce
    .map((s) => s.replace(/\n+/g, ' ').trim())
    .filter((s) => s !== '');
  const app =
    f.appName === null || f.appName.trim() === ''
      ? 'an unknown app'
      : f.appName.replace(/[\n_*{}[\]!|]/g, ' ').trim();
  return [
    'h3. Environment',
    block(f.environment),
    'h3. Steps to reproduce',
    ...(steps.length > 0 ? steps.map((s) => `# ${s}`) : ['_Not provided_']),
    'h3. Actual result',
    block(f.actualResult),
    'h3. Expected result',
    block(f.expectedResult),
    'h3. Screenshot',
    `!${attachmentFileName(f.requestId)}!`,
    '----',
    `_Created with Laqta from ${app}. Draft written by AI, reviewed and approved by the reporter._`,
  ].join('\n');
}

/**
 * The sanitizer escapes markup in model text. For display and editing in the review form
 * the escapes are removed again; `escapeUserWiki` re-applies them when the description is
 * built, so the final wiki is always neutralised.
 */
export function unescapeWiki(text: string): string {
  return text.replace(/\\([{}[\]!*#\-|.])/g, '$1');
}
