import type {
  AppError,
  ApprovedBug,
  AssigneeCandidate,
  AssigneeResolution,
  BugLanguage,
  CaptureMode,
  CreateMeta,
  CreateResult,
  DraftResult,
  DuplicateHit,
  JiraProject,
  OverlayFrame,
  PermissionStatus,
  Rect,
  ReviewState,
  Session,
  SessionImage,
  SettingsSetRequest,
  SettingsSetResult,
  SettingsView,
  TestConnectionResult,
  ToastData,
  VoiceLanguage,
} from './types';
import type { ToastResize } from './schemas';

/** Every IPC handler answers with this envelope; the preload unwraps it. */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

/** The `window.laqta` object exposed by the preload script (spec section 3). */
export interface LaqtaApi {
  readonly platform: string;
  captureStart(p: { mode: CaptureMode }): Promise<void>;
  captureComplete(p: { displayId: string; rect: Rect; mode: CaptureMode }): Promise<void>;
  captureCancel(): Promise<void>;
  overlayGetFrame(): Promise<OverlayFrame>;
  sessionGet(): Promise<Session | null>;
  sessionGetImage(): Promise<SessionImage>;
  sessionSetRedactedImage(p: { png: Uint8Array; width: number; height: number }): Promise<void>;
  sessionBack(): Promise<void>;
  sessionDiscard(): Promise<void>;
  sessionGetReview(): Promise<ReviewState | null>;
  draftRequest(p: {
    prompt: string;
    projectKey: string;
    bugLanguage: BugLanguage;
  }): Promise<DraftResult>;
  draftCancel(): Promise<void>;
  draftKeepForLater(review: ReviewState): Promise<{ saved: boolean }>;
  voiceTranscribe(p: {
    audio: Uint8Array;
    mime: string;
    language: VoiceLanguage;
  }): Promise<{ text: string }>;
  jiraSearchAssignees(p: { projectKey: string; query: string }): Promise<AssigneeCandidate[]>;
  jiraResolveAssignee(p: {
    projectKey: string;
    query: string;
    transliteration: string | null;
  }): Promise<AssigneeResolution>;
  jiraCheckDuplicates(p: { projectKey: string; summary: string }): Promise<DuplicateHit[]>;
  jiraLoadCreateMeta(p: { projectKey: string; issueTypeName?: string }): Promise<CreateMeta>;
  jiraListProjects(): Promise<JiraProject[]>;
  jiraCreateBug(bug: ApprovedBug): Promise<CreateResult>;
  jiraRetryAttachment(p: { issueKey: string; requestId: string }): Promise<CreateResult>;
  settingsGet(): Promise<SettingsView>;
  settingsSet(req: SettingsSetRequest): Promise<SettingsSetResult>;
  settingsTestConnection(p: {
    baseUrl: string;
    token?: string;
    deployment: 'datacenter' | 'cloud';
    email?: string;
  }): Promise<TestConnectionResult>;
  toastGet(): Promise<ToastData | null>;
  toastClose(): Promise<void>;
  toastResize(p: ToastResize): Promise<void>;
  appOpenLink(p: { url: string }): Promise<void>;
  appCopyText(p: { text: string }): Promise<void>;
  appOpenSettings(): Promise<void>;
  /** Restarts Laqta (Settings only), so macOS applies a new Screen Recording grant. */
  appRelaunch(): Promise<void>;
  permissionsGet(): Promise<PermissionStatus>;
  permissionsOpenSystemSettings(p: { kind: 'screen' | 'microphone' }): Promise<void>;
  permissionsRequestMicrophone(): Promise<boolean>;
  windowClose(): Promise<void>;
  onSessionChanged(listener: (session: Session | null) => void): () => void;
}

/**
 * What the preload actually exposes: the same methods, answering with the raw envelope.
 * Errors thrown across contextBridge lose their fields, so unwrapping happens in the
 * renderer (`renderer/shared/api.ts`).
 */
export type LaqtaBridge = {
  [K in keyof LaqtaApi]: LaqtaApi[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => Promise<IpcResult<R>>
    : LaqtaApi[K];
};

export class LaqtaIpcError extends Error {
  constructor(readonly error: AppError) {
    super(error.userMessage);
    this.name = 'LaqtaIpcError';
  }
}
