import { JiraUserListSchema } from '../../shared/schemas';
import type { AssigneeCandidate, AssigneeResolution } from '../../shared/types';
import type { JiraClient } from './client';
import { JIRA } from './endpoints';

// Spec section 8, assignee resolution.

export type { AssigneeResolution };

export async function searchAssignable(
  client: JiraClient,
  projectKey: string,
  text: string,
): Promise<AssigneeCandidate[]> {
  const users = await client.request(
    'GET',
    JIRA.assignable(client.deployment, projectKey, text),
    JiraUserListSchema,
  );
  const out: AssigneeCandidate[] = [];
  for (const u of users) {
    if (u.active === false) continue;
    // Cloud: skip apps and other non-human accounts (spec section 8.2).
    if (u.accountType !== undefined && u.accountType !== 'atlassian') continue;
    const username = client.deployment === 'cloud' ? u.accountId : u.name;
    if (username === undefined || username === '') continue;
    out.push({
      username,
      displayName: u.displayName,
      email: u.emailAddress ?? null,
      avatarUrl: u.avatarUrls?.['48x48'] ?? null,
    });
  }
  return out;
}

const norm = (s: string) => s.normalize('NFKC').toLocaleLowerCase().trim();

export function firstFragment(text: string | null): string | null {
  if (text === null) return null;
  const first = text.trim().split(/\s+/)[0];
  return first === undefined || first === '' ? null : first;
}

/** Query as spoken, then the transliteration, then the first name fragment. */
export function searchTerms(query: string, transliteration: string | null): string[] {
  const terms = [query, transliteration, firstFragment(query), firstFragment(transliteration)];
  const out: string[] = [];
  for (const term of terms) {
    if (term === null) continue;
    const t = term.trim();
    if (t !== '' && !out.some((o) => norm(o) === norm(t))) out.push(t);
  }
  return out;
}

/** 0 exact display-name match, 1 prefix match, 2 other (matched on username or email). */
export function matchRank(candidate: AssigneeCandidate, terms: readonly string[]): number {
  const name = norm(candidate.displayName);
  if (terms.some((t) => norm(t) === name)) return 0;
  if (terms.some((t) => name.startsWith(norm(t)))) return 1;
  return 2;
}

export function rankCandidates(
  candidates: readonly AssigneeCandidate[],
  terms: readonly string[],
): AssigneeCandidate[] {
  const unique = new Map<string, AssigneeCandidate>();
  for (const c of candidates) if (!unique.has(c.username)) unique.set(c.username, c);
  return [...unique.values()]
    .map((c, index) => ({ c, index, rank: matchRank(c, terms) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.c);
}

/**
 * Zero candidates: nothing preselected. Exactly one candidate whose display name matches
 * the name (exactly, or as a prefix, as on design board 3): preselect it. Anything else:
 * the picker opens with nothing preselected.
 */
export function decide(
  ranked: readonly AssigneeCandidate[],
  terms: readonly string[],
): AssigneeResolution {
  const only = ranked.length === 1 ? ranked[0] : undefined;
  if (only && matchRank(only, terms) <= 1) {
    const name = norm(only.displayName);
    const from =
      terms.find((t) => norm(t) === name) ?? terms.find((t) => name.startsWith(norm(t))) ?? null;
    return { candidates: [...ranked], preselected: only.username, matchedFrom: from };
  }
  return { candidates: [...ranked], preselected: null, matchedFrom: null };
}

export async function resolveAssignee(
  client: JiraClient,
  projectKey: string,
  query: string,
  transliteration: string | null,
): Promise<AssigneeResolution> {
  const terms = searchTerms(query, transliteration);
  const found: AssigneeCandidate[] = [];
  for (const term of terms) {
    found.push(...(await searchAssignable(client, projectKey, term)));
    // Stop early once the spoken form or transliteration found people.
    if (found.length > 0 && term !== firstFragment(query)) break;
  }
  const ranked = rankCandidates(found, terms);
  return decide(ranked, terms);
}
