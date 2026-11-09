import type {
  AppError,
  ApprovedBug,
  BugDraft,
  BugLanguage,
  CaptureMode,
  FlowState,
  Rect,
  ReviewState,
} from '../shared/types';

// The flow state machine of spec section 3 as a pure function. It knows nothing about
// Electron; `flow.ts` keeps the session data and hands the effects to an effect runner.

export interface DraftRequest {
  prompt: string;
  projectKey: string;
  bugLanguage: BugLanguage;
}

export type FlowEvent =
  | { type: 'capture:start'; mode: CaptureMode }
  | { type: 'capture:failed'; error: AppError }
  | { type: 'capture:complete'; displayId: string; rect: Rect; mode: CaptureMode }
  | { type: 'capture:cancel' }
  | { type: 'draft:request'; request: DraftRequest }
  | { type: 'draft:success'; draft: BugDraft }
  | { type: 'draft:failure'; error: AppError }
  | { type: 'draft:cancel' }
  | { type: 'back' }
  | { type: 'jira:createBug'; bug: ApprovedBug }
  | { type: 'create:ok'; issueKey: string; browseUrl: string }
  | { type: 'create:partial'; issueKey: string; browseUrl: string; error: AppError }
  | { type: 'create:failed'; error: AppError; retryable: boolean }
  | { type: 'create:unknown' }
  | { type: 'verify:found'; issueKey: string }
  | { type: 'verify:notFound' }
  | { type: 'jira:retryAttachment'; issueKey: string }
  | { type: 'draft:restore'; review: ReviewState }
  | { type: 'session:discard' };

export type Effect =
  | { type: 'beginCapture'; mode: CaptureMode }
  | { type: 'focusSession' }
  | { type: 'reportCaptureError'; error: AppError }
  | { type: 'cropAndOpenWorkbench'; displayId: string; rect: Rect; mode: CaptureMode }
  | { type: 'closeOverlays' }
  | { type: 'callProvider'; request: DraftRequest }
  | { type: 'storeDraft'; draft: BugDraft }
  | { type: 'reportDraftError'; error: AppError }
  | { type: 'abortDraft' }
  | { type: 'createIssue'; bug: ApprovedBug }
  | { type: 'verifyByLabel' }
  | { type: 'uploadAttachment'; issueKey: string }
  | { type: 'showResult'; issueKey: string; browseUrl: string; attachmentError: AppError | null }
  | { type: 'reportCreateError'; error: AppError; retryable: boolean }
  | { type: 'deleteImage' }
  | { type: 'closeWorkbench' }
  | { type: 'closeSessionWindows' }
  | { type: 'openRestoredReview'; review: ReviewState };

export interface Transition {
  state: FlowState;
  effects: Effect[];
}

/** Returns the next state and its effects, or `null` when the event is not valid now. */
export function transition(state: FlowState, event: FlowEvent): Transition | null {
  // Any state: discard or window closed (the unsaved-edits confirm happens before dispatch).
  if (event.type === 'session:discard') {
    if (state === 'idle') return null;
    const effects: Effect[] = [];
    if (state === 'capturing') effects.push({ type: 'closeOverlays' });
    if (state === 'drafting') effects.push({ type: 'abortDraft' });
    effects.push({ type: 'deleteImage' }, { type: 'closeSessionWindows' });
    return { state: 'idle', effects };
  }

  // A second hotkey press while a session is active focuses the existing window.
  if (event.type === 'capture:start' && state !== 'idle') {
    return { state, effects: [{ type: 'focusSession' }] };
  }

  switch (state) {
    case 'idle':
      if (event.type === 'capture:start') {
        return { state: 'capturing', effects: [{ type: 'beginCapture', mode: event.mode }] };
      }
      if (event.type === 'draft:restore') {
        return {
          state: 'reviewing',
          effects: [{ type: 'openRestoredReview', review: event.review }],
        };
      }
      return null;

    case 'capturing':
      if (event.type === 'capture:complete') {
        const { displayId, rect, mode } = event;
        return {
          state: 'editing',
          effects: [{ type: 'cropAndOpenWorkbench', displayId, rect, mode }],
        };
      }
      if (event.type === 'capture:cancel') {
        return { state: 'idle', effects: [{ type: 'closeOverlays' }, { type: 'deleteImage' }] };
      }
      if (event.type === 'capture:failed') {
        return {
          state: 'idle',
          effects: [
            { type: 'closeOverlays' },
            { type: 'deleteImage' },
            { type: 'reportCaptureError', error: event.error },
          ],
        };
      }
      return null;

    case 'editing':
      if (event.type === 'draft:request') {
        return {
          state: 'drafting',
          effects: [{ type: 'callProvider', request: event.request }],
        };
      }
      return null;

    case 'drafting':
      if (event.type === 'draft:success') {
        return { state: 'reviewing', effects: [{ type: 'storeDraft', draft: event.draft }] };
      }
      if (event.type === 'draft:failure') {
        return { state: 'editing', effects: [{ type: 'reportDraftError', error: event.error }] };
      }
      if (event.type === 'draft:cancel') {
        return { state: 'editing', effects: [{ type: 'abortDraft' }] };
      }
      return null;

    case 'reviewing':
      if (event.type === 'back') return { state: 'editing', effects: [] };
      if (event.type === 'jira:createBug') {
        return { state: 'submitting', effects: [{ type: 'createIssue', bug: event.bug }] };
      }
      return null;

    case 'submitting':
      if (event.type === 'create:ok') {
        return {
          state: 'done',
          effects: [
            {
              type: 'showResult',
              issueKey: event.issueKey,
              browseUrl: event.browseUrl,
              attachmentError: null,
            },
            { type: 'deleteImage' },
            { type: 'closeWorkbench' },
          ],
        };
      }
      if (event.type === 'create:partial') {
        // The image is kept so Retry upload can send it again.
        return {
          state: 'partial',
          effects: [
            {
              type: 'showResult',
              issueKey: event.issueKey,
              browseUrl: event.browseUrl,
              attachmentError: event.error,
            },
            { type: 'closeWorkbench' },
          ],
        };
      }
      if (event.type === 'create:failed') {
        return {
          state: 'reviewing',
          effects: [{ type: 'reportCreateError', error: event.error, retryable: event.retryable }],
        };
      }
      if (event.type === 'create:unknown') {
        return { state: 'verifying', effects: [{ type: 'verifyByLabel' }] };
      }
      return null;

    case 'verifying':
      if (event.type === 'verify:found') {
        return {
          state: 'submitting',
          effects: [{ type: 'uploadAttachment', issueKey: event.issueKey }],
        };
      }
      if (event.type === 'verify:notFound') {
        return { state: 'reviewing', effects: [] };
      }
      return null;

    case 'partial':
      if (event.type === 'jira:retryAttachment') {
        return {
          state: 'submitting',
          effects: [{ type: 'uploadAttachment', issueKey: event.issueKey }],
        };
      }
      return null;

    case 'done':
      return null;
  }
}

/** States where closing the window loses work the user typed or drew. */
export function hasUnsavedWork(state: FlowState): boolean {
  return state === 'editing' || state === 'drafting' || state === 'reviewing';
}
