import { JiraSearchSchema } from '../../shared/schemas';
import type { DuplicateHit } from '../../shared/types';
import type { JiraClient } from './client';
import { JIRA } from './endpoints';

// Spec section 8, duplicate check. A warning only; it never blocks creation.

export function duplicateWords(summary: string): string[] {
  const words = summary.match(/\p{L}{4,}/gu) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (!out.some((o) => o.toLowerCase() === w.toLowerCase())) out.push(w);
    if (out.length === 6) break;
  }
  return out;
}

export function escapeJqlString(value: string): string {
  return value.replace(/[\\"]/g, (c) => `\\${c}`);
}

export function duplicateJql(projectKey: string, summary: string): string | null {
  const words = duplicateWords(summary);
  if (words.length === 0) return null;
  const text = escapeJqlString(words.join(' '));
  return `project = "${escapeJqlString(projectKey)}" AND resolution = Unresolved AND created >= -90d AND text ~ "${text}" ORDER BY created DESC`;
}

export async function checkDuplicates(
  client: JiraClient,
  projectKey: string,
  summary: string,
): Promise<DuplicateHit[]> {
  const jql = duplicateJql(projectKey, summary);
  if (jql === null) return [];
  const res = await client.request('POST', JIRA.search(), JiraSearchSchema, {
    jql,
    fields: ['summary', 'status'],
    maxResults: 5,
  });
  return res.issues.map((i) => ({
    key: i.key,
    summary: i.fields.summary ?? '',
    status: i.fields.status?.name ?? '',
    browseUrl: client.browseUrl(i.key),
  }));
}
