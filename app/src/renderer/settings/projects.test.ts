import { describe, expect, it } from 'vitest';
import {
  connectionKeyOf,
  isLatestRequest,
  optionLabel,
  projectField,
  settleSaved,
  testedNow,
  type ProjectFieldInput,
  type SavedProjects,
} from './projects';

const details = {
  jiraBaseUrl: 'https://jira.example.test',
  jiraDeployment: 'datacenter' as const,
  jiraEmail: '',
};
const SAVED = connectionKeyOf(details, '');
const OTHER = connectionKeyOf({ ...details, jiraBaseUrl: 'https://other.example.test' }, '');
const LIST = [
  { key: 'APP', name: 'App' },
  { key: 'WEB', name: 'Web' },
];
const OTHER_LIST = [{ key: 'OPS', name: 'Ops' }];

const input = (patch: Partial<ProjectFieldInput>): ProjectFieldInput => ({
  connectionKey: SAVED,
  savedKey: SAVED,
  saved: { kind: 'ok', key: SAVED, list: LIST },
  tested: null,
  defaultProjectKey: '',
  ...patch,
});

describe('projectField', () => {
  it('asks to connect first when nothing is configured or tested', () => {
    expect(projectField(input({ savedKey: null, saved: { kind: 'none' } }))).toEqual({
      mode: 'disconnected',
    });
  });

  it('offers the saved list while the saved details are unchanged', () => {
    expect(projectField(input({ defaultProjectKey: 'APP' }))).toEqual({
      mode: 'select',
      options: LIST,
      staleKey: null,
    });
  });

  it('shows loading while the saved list is on its way', () => {
    expect(projectField(input({ saved: { kind: 'loading', key: SAVED, request: 1 } }))).toEqual({
      mode: 'loading',
    });
  });

  it('asks to connect first for edited details that have not been tested', () => {
    expect(projectField(input({ connectionKey: OTHER }))).toEqual({ mode: 'disconnected' });
  });

  it('offers the tested list for edited details that tested fine', () => {
    const field = projectField(
      input({
        connectionKey: OTHER,
        tested: { key: OTHER, userName: 'A', projects: OTHER_LIST },
      }),
    );
    expect(field).toEqual({ mode: 'select', options: OTHER_LIST, staleKey: null });
  });

  it('finds the saved list again after reverting from tested details', () => {
    // A test with other details never overwrites the saved list, so the revert is not stuck.
    const field = projectField(
      input({ tested: { key: OTHER, userName: 'A', projects: OTHER_LIST } }),
    );
    expect(field).toEqual({ mode: 'select', options: LIST, staleKey: null });
  });

  it('counts typed-back tested details as tested on first launch', () => {
    const first = input({
      savedKey: null,
      saved: { kind: 'none' },
      tested: { key: OTHER, userName: 'A', projects: OTHER_LIST },
    });
    expect(projectField({ ...first, connectionKey: SAVED }).mode).toBe('disconnected');
    expect(projectField({ ...first, connectionKey: OTHER }).mode).toBe('select');
    expect(testedNow(first.tested, OTHER)).toBe(true);
    expect(testedNow(first.tested, SAVED)).toBe(false);
  });

  it('treats a deployment switch as new, untested details', () => {
    const cloud = connectionKeyOf({ ...details, jiraDeployment: 'cloud' }, '');
    expect(projectField(input({ connectionKey: cloud }))).toEqual({ mode: 'disconnected' });
  });

  it('keeps a saved default Jira no longer lists and flags it', () => {
    expect(projectField(input({ defaultProjectKey: 'GONE' }))).toEqual({
      mode: 'select',
      options: [{ key: 'GONE', name: '' }, ...LIST],
      staleKey: 'GONE',
    });
  });

  it('returns an empty select when the account sees no projects', () => {
    expect(projectField(input({ saved: { kind: 'ok', key: SAVED, list: [] } }))).toEqual({
      mode: 'select',
      options: [],
      staleKey: null,
    });
  });

  it('falls back to typing the key when the saved list fails, retrying the load', () => {
    expect(projectField(input({ saved: { kind: 'error', key: SAVED } }))).toEqual({
      mode: 'fallback',
      retry: 'saved',
    });
  });

  it('falls back to typing the key when a test worked but listing failed, retrying the test', () => {
    expect(
      projectField(
        input({ connectionKey: OTHER, tested: { key: OTHER, userName: 'A', projects: null } }),
      ),
    ).toEqual({ mode: 'fallback', retry: 'test' });
  });

  it('prefers a tested list over a failed saved load for the same details', () => {
    const field = projectField(
      input({
        saved: { kind: 'error', key: SAVED },
        tested: { key: SAVED, userName: 'A', projects: LIST },
      }),
    );
    expect(field.mode).toBe('select');
  });
});

describe('settleSaved', () => {
  const loading: SavedProjects = { kind: 'loading', key: SAVED, request: 2 };

  it('applies the answer to the request still waiting', () => {
    expect(settleSaved(loading, 2, { ok: true, list: LIST })).toEqual({
      kind: 'ok',
      key: SAVED,
      list: LIST,
    });
    expect(settleSaved(loading, 2, { ok: false })).toEqual({ kind: 'error', key: SAVED });
  });

  it('ignores a stale answer from an older request', () => {
    expect(settleSaved(loading, 1, { ok: true, list: OTHER_LIST })).toBe(loading);
    const done: SavedProjects = { kind: 'ok', key: SAVED, list: LIST };
    expect(settleSaved(done, 2, { ok: false })).toBe(done);
  });

  it('accepts only the latest test request', () => {
    expect(isLatestRequest(3, 3)).toBe(true);
    expect(isLatestRequest(2, 3)).toBe(false);
  });
});

describe('optionLabel', () => {
  it('isolates the project name so Arabic text does not reorder the key', () => {
    expect(optionLabel({ key: 'APP', name: 'تطبيق' })).toBe('APP · ⁨تطبيق⁩');
    expect(optionLabel({ key: 'GONE', name: '' })).toBe('GONE');
  });
});
