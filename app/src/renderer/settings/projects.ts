import type { JiraProject, Settings } from '../../shared/types';

/**
 * Decisions behind the Settings "Default project" field, kept pure so every case (saved,
 * edited, tested, reverted, failed, stale) is unit tested without React or IPC.
 */

/** Identifies one set of connection details; an empty token means the stored one. */
export function connectionKeyOf(
  s: Pick<Settings, 'jiraBaseUrl' | 'jiraDeployment' | 'jiraEmail'>,
  token: string,
): string {
  return [s.jiraBaseUrl, s.jiraDeployment, s.jiraEmail, token].join('\u0000');
}

/**
 * The list loaded with the SAVED connection (`jira:listProjects` only knows that one). It
 * lives in its own slot so a test with other details never overwrites it: reverting the form
 * to the saved details then finds it again.
 */
export type SavedProjects =
  | { kind: 'none' }
  | { kind: 'loading'; key: string; request: number }
  | { kind: 'ok'; key: string; list: JiraProject[] }
  | { kind: 'error'; key: string };

/**
 * The last successful connection test. `projects` is null when the connection worked but
 * the list could not be read. Kept after the form changes, so typing the tested details back
 * in counts as tested again.
 */
export interface TestedConnection {
  key: string;
  userName: string;
  projects: JiraProject[] | null;
}

export type ListOutcome = { ok: true; list: JiraProject[] } | { ok: false };

/**
 * Applies a `jira:listProjects` answer only if it belongs to the request still waiting, so a
 * slow answer for older details never replaces a newer one.
 */
export function settleSaved(
  slot: SavedProjects,
  request: number,
  outcome: ListOutcome,
): SavedProjects {
  if (slot.kind !== 'loading' || slot.request !== request) return slot;
  return outcome.ok
    ? { kind: 'ok', key: slot.key, list: outcome.list }
    : { kind: 'error', key: slot.key };
}

/** True when an answer comes from the latest request of its kind; older ones are dropped. */
export function isLatestRequest(request: number, latest: number): boolean {
  return request === latest;
}

export interface ProjectOption {
  key: string;
  /** Empty for a saved key Jira no longer lists. */
  name: string;
}

export type ProjectField =
  /** No working connection for the details on screen: disabled select, "connect first". */
  | { mode: 'disconnected' }
  | { mode: 'loading' }
  /** `staleKey` is the saved default that Jira no longer lists (kept as an option). */
  | { mode: 'select'; options: ProjectOption[]; staleKey: string | null }
  /** Connected but the list failed: free text input plus a retry (reload or re-test). */
  | { mode: 'fallback'; retry: 'saved' | 'test' };

export interface ProjectFieldInput {
  /** Key of the details on screen. */
  connectionKey: string;
  /** Key of the saved details, or null when nothing usable is saved. */
  savedKey: string | null;
  saved: SavedProjects;
  tested: TestedConnection | null;
  defaultProjectKey: string;
}

function selectField(list: JiraProject[], defaultProjectKey: string): ProjectField {
  const options = list.map((p) => ({ key: p.key, name: p.name }));
  const stale = defaultProjectKey !== '' && !list.some((p) => p.key === defaultProjectKey);
  return stale
    ? {
        mode: 'select',
        options: [{ key: defaultProjectKey, name: '' }, ...options],
        staleKey: defaultProjectKey,
      }
    : { mode: 'select', options, staleKey: null };
}

export function projectField(i: ProjectFieldInput): ProjectField {
  const tested = i.tested !== null && i.tested.key === i.connectionKey ? i.tested : null;
  if (tested !== null && tested.projects !== null) {
    return selectField(tested.projects, i.defaultProjectKey);
  }
  if (i.savedKey !== null && i.savedKey === i.connectionKey) {
    const s = i.saved;
    if (s.kind === 'ok' && s.key === i.connectionKey) {
      return selectField(s.list, i.defaultProjectKey);
    }
    if (s.kind === 'error' && s.key === i.connectionKey)
      return { mode: 'fallback', retry: 'saved' };
    // The saved list is (re)loaded whenever the saved details change, so anything else is
    // that load still on its way.
    return { mode: 'loading' };
  }
  if (tested !== null) return { mode: 'fallback', retry: 'test' };
  return { mode: 'disconnected' };
}

/** The details on screen are the ones the last successful test used. */
export function testedNow(tested: TestedConnection | null, connectionKey: string): boolean {
  return tested !== null && tested.key === connectionKey;
}

/**
 * Wraps text in Unicode first-strong isolates (FSI … PDI) so an Arabic project name does not
 * reorder the key or separator next to it.
 */
export function isolate(text: string): string {
  return `⁨${text}⁩`;
}

export function optionLabel(option: ProjectOption): string {
  return option.name === '' ? option.key : `${option.key} · ${isolate(option.name)}`;
}
