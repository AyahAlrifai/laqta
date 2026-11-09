import { describe, expect, it } from 'vitest';
import type { AppError, ApprovedBug, BugDraft, FlowState, ReviewState } from '../shared/types';
import { transition, type FlowEvent } from './orchestrator';

const error: AppError = { code: 'UNKNOWN', userMessage: 'x' };
const draft: BugDraft = {
  summary: 's',
  environment: 'e',
  stepsToReproduce: [],
  actualResult: 'a',
  expectedResult: 'b',
  issueType: 'Bug',
  priority: null,
  assigneeQuery: null,
  assigneeTransliteration: null,
  labels: [],
  missingInfo: [],
};
const bug: ApprovedBug = {
  requestId: '00000000-0000-4000-8000-000000000000',
  projectKey: 'PROJ',
  issueType: 'Bug',
  summary: 's',
  descriptionWiki: 'd',
  priority: null,
  assigneeUsername: null,
  labels: ['laqta'],
  extraFields: {},
  attachmentFileName: 'f.png',
};
const request = { prompt: 'p', projectKey: 'PROJ', bugLanguage: 'en' as const };
const review: ReviewState = {
  projectKey: 'PROJ',
  bugLanguage: 'en',
  prompt: 'p',
  draft,
  assignee: null,
  extraFields: {},
};

function next(state: FlowState, event: FlowEvent) {
  const result = transition(state, event);
  if (!result) throw new Error(`rejected ${state} + ${event.type}`);
  return { state: result.state, effects: result.effects.map((e) => e.type) };
}

// One test per row of the state table in spec section 3.
describe('orchestrator state table', () => {
  it('idle + capture:start -> capturing, begins capture', () => {
    expect(next('idle', { type: 'capture:start', mode: 'area' })).toEqual({
      state: 'capturing',
      effects: ['beginCapture'],
    });
  });

  it('capturing + capture:complete -> editing, crops and opens the workbench', () => {
    const r = next('capturing', {
      type: 'capture:complete',
      displayId: '1',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      mode: 'area',
    });
    expect(r).toEqual({ state: 'editing', effects: ['cropAndOpenWorkbench'] });
  });

  it('capturing + capture:cancel -> idle, closes overlays and drops frames', () => {
    expect(next('capturing', { type: 'capture:cancel' })).toEqual({
      state: 'idle',
      effects: ['closeOverlays', 'deleteImage'],
    });
  });

  it('editing + draft:request -> drafting, calls the provider', () => {
    expect(next('editing', { type: 'draft:request', request })).toEqual({
      state: 'drafting',
      effects: ['callProvider'],
    });
  });

  it('drafting + provider success -> reviewing, stores the draft', () => {
    expect(next('drafting', { type: 'draft:success', draft })).toEqual({
      state: 'reviewing',
      effects: ['storeDraft'],
    });
  });

  it('drafting + provider failure -> editing, shows the error', () => {
    expect(next('drafting', { type: 'draft:failure', error })).toEqual({
      state: 'editing',
      effects: ['reportDraftError'],
    });
  });

  it('drafting + draft:cancel -> editing, aborts the request', () => {
    expect(next('drafting', { type: 'draft:cancel' })).toEqual({
      state: 'editing',
      effects: ['abortDraft'],
    });
  });

  it('reviewing + back -> editing, keeps prompt and image', () => {
    expect(next('reviewing', { type: 'back' })).toEqual({ state: 'editing', effects: [] });
  });

  it('reviewing + jira:createBug -> submitting, creates the issue', () => {
    expect(next('reviewing', { type: 'jira:createBug', bug })).toEqual({
      state: 'submitting',
      effects: ['createIssue'],
    });
  });

  it('submitting + created and attached -> done, shows the toast and deletes the image', () => {
    expect(
      next('submitting', { type: 'create:ok', issueKey: 'PROJ-1', browseUrl: 'https://j/b' }),
    ).toEqual({ state: 'done', effects: ['showResult', 'deleteImage', 'closeWorkbench'] });
  });

  it('submitting + created, attachment failed -> partial, keeps the image', () => {
    const r = next('submitting', {
      type: 'create:partial',
      issueKey: 'PROJ-1',
      browseUrl: 'https://j/b',
      error,
    });
    expect(r.state).toBe('partial');
    expect(r.effects).toContain('showResult');
    expect(r.effects).not.toContain('deleteImage');
  });

  it('submitting + create failed, safe to retry -> reviewing, keeps the draft', () => {
    expect(next('submitting', { type: 'create:failed', error, retryable: true })).toEqual({
      state: 'reviewing',
      effects: ['reportCreateError'],
    });
  });

  it('submitting + outcome unknown -> verifying, searches for the request label', () => {
    expect(next('submitting', { type: 'create:unknown' })).toEqual({
      state: 'verifying',
      effects: ['verifyByLabel'],
    });
  });

  it('verifying + issue found -> submitting, attachment only', () => {
    expect(next('verifying', { type: 'verify:found', issueKey: 'PROJ-1' })).toEqual({
      state: 'submitting',
      effects: ['uploadAttachment'],
    });
  });

  it('verifying + issue not found -> reviewing, allows Create again', () => {
    expect(next('verifying', { type: 'verify:notFound' })).toEqual({
      state: 'reviewing',
      effects: [],
    });
  });

  it.each<FlowState>([
    'capturing',
    'editing',
    'drafting',
    'reviewing',
    'submitting',
    'verifying',
    'partial',
    'done',
  ])('%s + session:discard -> idle, deletes the image', (state) => {
    const r = next(state, { type: 'session:discard' });
    expect(r.state).toBe('idle');
    expect(r.effects).toContain('deleteImage');
    expect(r.effects).toContain('closeSessionWindows');
  });

  it('discard while drafting aborts the request; while capturing closes overlays', () => {
    expect(next('drafting', { type: 'session:discard' }).effects).toContain('abortDraft');
    expect(next('capturing', { type: 'session:discard' }).effects).toContain('closeOverlays');
  });
});

describe('orchestrator additions (spec section 3.1)', () => {
  it('a second capture:start while active focuses the session and keeps the state', () => {
    expect(next('reviewing', { type: 'capture:start', mode: 'area' })).toEqual({
      state: 'reviewing',
      effects: ['focusSession'],
    });
  });

  it('partial + retry upload -> submitting, uploads only the attachment', () => {
    expect(next('partial', { type: 'jira:retryAttachment', issueKey: 'PROJ-1' })).toEqual({
      state: 'submitting',
      effects: ['uploadAttachment'],
    });
  });

  it('capturing + capture:failed -> idle and reports the error', () => {
    expect(next('capturing', { type: 'capture:failed', error }).effects).toContain(
      'reportCaptureError',
    );
  });

  it('idle + draft:restore -> reviewing', () => {
    expect(next('idle', { type: 'draft:restore', review })).toEqual({
      state: 'reviewing',
      effects: ['openRestoredReview'],
    });
  });

  it('rejects events that do not fit the current state', () => {
    expect(transition('idle', { type: 'jira:createBug', bug })).toBeNull();
    expect(transition('editing', { type: 'jira:createBug', bug })).toBeNull();
    expect(transition('drafting', { type: 'jira:createBug', bug })).toBeNull();
    expect(transition('submitting', { type: 'jira:createBug', bug })).toBeNull();
    expect(transition('reviewing', { type: 'draft:request', request })).toBeNull();
    expect(transition('done', { type: 'jira:retryAttachment', issueKey: 'P-1' })).toBeNull();
    expect(transition('idle', { type: 'session:discard' })).toBeNull();
  });

  it('only reviewing + Create bug can lead to a Jira write', () => {
    const states: FlowState[] = [
      'idle',
      'capturing',
      'editing',
      'drafting',
      'reviewing',
      'submitting',
      'verifying',
      'partial',
      'done',
    ];
    const events: FlowEvent[] = [
      { type: 'capture:start', mode: 'area' },
      { type: 'capture:cancel' },
      { type: 'draft:request', request },
      { type: 'draft:success', draft },
      { type: 'draft:failure', error },
      { type: 'back' },
      { type: 'create:failed', error, retryable: true },
      { type: 'verify:notFound' },
      { type: 'session:discard' },
      { type: 'draft:restore', review },
    ];
    for (const s of states) {
      for (const e of events) {
        const r = transition(s, e);
        expect(r?.effects.some((x) => x.type === 'createIssue') ?? false).toBe(false);
      }
    }
  });
});
