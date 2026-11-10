// Spec section 4 is binding. The block between the two markers is copied from it; the types
// after the second marker are additions documented in spec section 4.1.

// ---- spec section 4 ----
export type CaptureMode = 'area' | 'window' | 'screen';
export type BugLanguage = 'en' | 'ar';
export type Priority = 'Highest' | 'High' | 'Medium' | 'Low' | 'Lowest';

/** What the AI returns. Everything is untrusted until validated and sanitized. */
export interface BugDraft {
  summary: string; // 1..120 chars, one line, no wiki markup
  environment: string; // short text, may be 'Not provided'
  stepsToReproduce: string[]; // empty array means 'Not provided'
  actualResult: string;
  expectedResult: string;
  issueType: string; // must be one of CreateMeta.issueTypes[].name
  priority: Priority | null; // null when the AI is unsure
  assigneeQuery: string | null; // name as the user said it, never an account id
  assigneeTransliteration: string | null; // English spelling of that name, if the query was Arabic
  labels: string[]; // extra labels, lower-case, [a-z0-9-], max 5
  missingInfo: string[]; // questions the AI could not answer from the inputs, max 5
}

export interface Session {
  id: string; // uuid v4, also used for the idempotency label
  state: FlowState;
  captureMode: CaptureMode;
  sourceApp: { name: string; windowTitle: string } | null;
  os: { platform: 'win32' | 'darwin'; release: string };
  imagePath: string | null; // temp file with the redacted PNG, deleted on done or discard
  width: number;
  height: number;
  capturedAt: string; // ISO 8601
}

export type FlowState =
  | 'idle'
  | 'capturing'
  | 'editing'
  | 'drafting'
  | 'reviewing'
  | 'submitting'
  | 'verifying'
  | 'partial'
  | 'done';

export interface ApprovedBug {
  // sent only after the user clicks Create bug
  requestId: string; // session id
  projectKey: string;
  issueType: string;
  summary: string;
  descriptionWiki: string; // built by the app from the approved fields, see section 8
  priority: Priority | null;
  assigneeUsername: string | null;
  labels: string[]; // always includes 'laqta' and 'laqta-' + requestId
  extraFields: Record<string, unknown>; // required custom fields from CreateMeta
  attachmentFileName: string; // 'laqta-' + requestId + '.png'
}

export type CreateResult =
  | { kind: 'ok'; issueKey: string; browseUrl: string }
  | { kind: 'partial'; issueKey: string; browseUrl: string; attachmentError: AppError }
  | { kind: 'failed'; error: AppError; retryable: boolean };

export interface AssigneeCandidate {
  username: string; // Data Center user name, or Cloud accountId (section 8.2)
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}
export interface DuplicateHit {
  key: string;
  summary: string;
  status: string;
  browseUrl: string;
}
export interface CreateMeta {
  issueTypes: { id: string; name: string }[];
  requiredFields: {
    id: string;
    name: string;
    schemaType: string;
    allowedValues?: { id: string; label: string }[];
  }[];
  priorities: Priority[];
}

export interface Settings {
  jiraBaseUrl: string; // https only
  jiraDeployment: 'datacenter' | 'cloud'; // section 8.2, default 'datacenter'
  jiraEmail: string; // Atlassian account email, used only with 'cloud'
  defaultProjectKey: string;
  bugLanguage: BugLanguage; // default 'en'
  uiLanguage: 'en' | 'ar';
  hotkeyArea: string; // Electron accelerator, default 'Control+Shift+J'
  hotkeyWindow: string;
  voiceEnabled: boolean; // default false in the MVP
  voiceLanguage: 'ar-JO' | 'en' | 'auto';
  telemetryEnabled: boolean;
}

export type AppErrorCode =
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'FIELD_ERROR'
  | 'NETWORK_UNREACHABLE'
  | 'TLS_ERROR'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'ATTACHMENT_TOO_LARGE'
  | 'AI_UNAVAILABLE'
  | 'AI_INVALID_OUTPUT'
  | 'PERMISSION_DENIED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface AppError {
  code: AppErrorCode;
  userMessage: string;
  detail?: string;
  fieldErrors?: Record<string, string>;
}
// ---- end of spec section 4 ----

// ---- spec section 4.1, additions ----
export type VoiceLanguage = Settings['voiceLanguage'];

/** Return value of `draft:request`. */
export type DraftResult = { kind: 'ok'; draft: BugDraft } | { kind: 'failed'; error: AppError };

/** Return value of `settings:get` and `settings:set`. The token itself is never included. */
export interface SettingsView {
  settings: Settings;
  hasToken: boolean;
  encryptionAvailable: boolean;
  appVersion: string;
  /** Kill switch message when AI drafting is turned off centrally, else null. */
  aiDisabledMessage: string | null;
  /** E2E runs against a local http mock Jira. */
  allowHttpJira: boolean;
}

export interface SettingsSetRequest {
  settings: Settings;
  /** A new token to store. Omitted means keep the stored one. */
  token?: string;
}

export interface TestConnectionResult {
  ok: boolean;
  userDisplayName?: string;
  error?: AppError;
}

export interface JiraProject {
  key: string;
  name: string;
}

/** Frozen frame sent to one overlay window. */
export interface OverlayFrame {
  displayId: string;
  /** JPEG of the frozen display, for display only. Cropping uses the lossless frame in main. */
  jpeg: Uint8Array;
  scaleFactor: number;
  widthDip: number;
  heightDip: number;
  initialMode: CaptureMode;
  windowModeAvailable: boolean;
  /** Foreground window bounds in this display's DIP coordinates, when known. */
  windowRect: Rect | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SessionImage {
  png: Uint8Array;
  width: number;
  height: number;
}

export type ToastData =
  | { kind: 'ok'; issueKey: string; browseUrl: string; assigneeName: string | null }
  | { kind: 'partial'; issueKey: string; browseUrl: string; attachmentError: AppError };

export interface PermissionStatus {
  platform: string;
  screen: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
  microphone: 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';
}

export interface SavedDraftInfo {
  requestId: string;
  summary: string;
  savedAt: string;
  expiresAt: string;
}

/** Everything the Review step needs to restore a draft saved for later (T-050). */
export interface ReviewState {
  projectKey: string;
  bugLanguage: BugLanguage;
  prompt: string;
  draft: BugDraft;
  assignee: AssigneeCandidate | null;
  extraFields: Record<string, unknown>;
}

export interface AssigneeResolution {
  candidates: AssigneeCandidate[];
  /** Set only when exactly one candidate matched the name; otherwise the user must pick. */
  preselected: string | null;
  matchedFrom: string | null;
}

export interface SettingsSetResult extends SettingsView {
  hotkeyConflicts: string[];
}
