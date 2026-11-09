import { z } from 'zod';
import { EXTRA_FIELD_ID } from './fields';
import type {
  ApprovedBug,
  BugDraft,
  CaptureMode,
  Priority,
  ReviewState,
  Settings,
  SettingsSetRequest,
} from './types';

// Zod schemas are the single source of truth for every payload that crosses a trust boundary:
// IPC from renderers, model output, Jira responses and files on disk (spec sections 0 and 4).

export const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'] as const;
export const CAPTURE_MODES = ['area', 'window', 'screen'] as const;
export const BUG_LANGUAGES = ['en', 'ar'] as const;
export const VOICE_LANGUAGES = ['ar-JO', 'en', 'auto'] as const;

/** Jira's default project key pattern. Keys are interpolated into JQL, so keep it strict. */
export const PROJECT_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,49}-[1-9][0-9]{0,9}$/;
export const MAX_PROMPT_CHARS = 2000;
export const MAX_IMAGE_BYTES = 50_000_000;

export const PrioritySchema: z.ZodType<Priority> = z.enum(PRIORITIES);
export const CaptureModeSchema: z.ZodType<CaptureMode> = z.enum(CAPTURE_MODES);
export const BugLanguageSchema = z.enum(BUG_LANGUAGES);
export const VoiceLanguageSchema = z.enum(VOICE_LANGUAGES);
export const ProjectKeySchema = z.string().regex(PROJECT_KEY_PATTERN);
export const RequestIdSchema = z.string().regex(UUID_PATTERN);
export const IssueKeySchema = z.string().regex(ISSUE_KEY_PATTERN);

const dim = z.number().int().min(1).max(32_768);
const bytes = z.instanceof(Uint8Array).refine((b) => b.byteLength <= MAX_IMAGE_BYTES, {
  message: 'too large',
});

export const RectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

// ---- model output ----

/**
 * Structural validation of the model's draft. Lengths that the sanitizer can safely cap
 * (other fields 2000, steps 300) are capped there; the hard limits in spec section 4 are
 * enforced here so an invalid draft triggers the single retry.
 */
export const BugDraftSchema: z.ZodType<BugDraft> = z.object({
  summary: z.string().trim().min(1).max(120),
  environment: z.string().max(4000),
  stepsToReproduce: z.array(z.string().max(1000)).max(30),
  actualResult: z.string().max(4000),
  expectedResult: z.string().max(4000),
  issueType: z.string().min(1).max(100),
  priority: PrioritySchema.nullable(),
  assigneeQuery: z.string().max(100).nullable(),
  assigneeTransliteration: z.string().max(100).nullable(),
  labels: z.array(z.string().max(50)).max(5),
  missingInfo: z.array(z.string().max(500)).max(5),
});

// ---- settings ----

export const DEFAULT_SETTINGS: Settings = {
  jiraBaseUrl: '',
  jiraDeployment: 'datacenter',
  jiraEmail: '',
  defaultProjectKey: '',
  bugLanguage: 'en',
  uiLanguage: 'en',
  hotkeyArea: 'CommandOrControl+Shift+J',
  hotkeyWindow: 'CommandOrControl+Shift+W',
  voiceEnabled: false,
  voiceLanguage: 'auto',
  telemetryEnabled: false,
};

/** Empty means "not configured yet" (first run). Otherwise https only (spec section 4). */
export const JiraBaseUrlSchema = z
  .string()
  .max(500)
  .refine((v) => v === '' || isHttpsUrl(v), { message: 'https only' });

export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

const accelerator = z
  .string()
  .max(60)
  .regex(/^[A-Za-z0-9+]*$/);

export const SettingsSchema: z.ZodType<Settings> = z.object({
  jiraBaseUrl: JiraBaseUrlSchema,
  jiraDeployment: z.enum(['datacenter', 'cloud']),
  jiraEmail: z.union([z.literal(''), z.email().max(254)]),
  defaultProjectKey: z.union([z.literal(''), ProjectKeySchema]),
  bugLanguage: BugLanguageSchema,
  uiLanguage: z.enum(['en', 'ar']),
  hotkeyArea: accelerator,
  hotkeyWindow: accelerator,
  voiceEnabled: z.boolean(),
  voiceLanguage: VoiceLanguageSchema,
  telemetryEnabled: z.boolean(),
});

export const SettingsSetRequestSchema: z.ZodType<SettingsSetRequest> = z.object({
  settings: SettingsSchema,
  token: z.string().min(1).max(500).optional(),
});

// ---- IPC payloads (spec section 3) ----

export const CaptureStartSchema = z.object({ mode: CaptureModeSchema });
export const CaptureCompleteSchema = z.object({
  displayId: z.string().max(64),
  rect: RectSchema,
  mode: CaptureModeSchema,
});
export const SetRedactedImageSchema = z.object({ png: bytes, width: dim, height: dim });
export const DraftRequestSchema = z.object({
  prompt: z.string().max(MAX_PROMPT_CHARS),
  projectKey: ProjectKeySchema,
  bugLanguage: BugLanguageSchema,
});
export const VoiceTranscribeSchema = z.object({
  audio: z.instanceof(Uint8Array).refine((b) => b.byteLength <= 10_000_000),
  mime: z.string().max(100),
  language: VoiceLanguageSchema,
});
export const SearchAssigneesSchema = z.object({
  projectKey: ProjectKeySchema,
  query: z.string().min(1).max(100),
});
export const ResolveAssigneeSchema = z.object({
  projectKey: ProjectKeySchema,
  query: z.string().min(1).max(100),
  transliteration: z.string().max(100).nullable(),
});
export const CheckDuplicatesSchema = z.object({
  projectKey: ProjectKeySchema,
  summary: z.string().min(1).max(120),
});
export const LoadCreateMetaSchema = z.object({
  projectKey: ProjectKeySchema,
  issueTypeName: z.string().max(100).optional(),
});
export const ApprovedBugSchema: z.ZodType<ApprovedBug> = z.object({
  requestId: RequestIdSchema,
  projectKey: ProjectKeySchema,
  issueType: z.string().min(1).max(100),
  summary: z.string().trim().min(1).max(120),
  descriptionWiki: z.string().max(32_000),
  priority: PrioritySchema.nullable(),
  assigneeUsername: z.string().min(1).max(255).nullable(),
  labels: z.array(z.string().max(255)).max(10),
  extraFields: z.record(z.string().regex(EXTRA_FIELD_ID), z.unknown()),
  attachmentFileName: z.string().max(100),
});
export const RetryAttachmentSchema = z.object({
  issueKey: IssueKeySchema,
  requestId: RequestIdSchema,
});
export const TestConnectionSchema = z.object({
  baseUrl: JiraBaseUrlSchema.refine((v) => v !== ''),
  /** Empty or omitted means use the stored token. */
  token: z.string().max(500).optional(),
  deployment: z.enum(['datacenter', 'cloud']).default('datacenter'),
  email: z.string().max(254).optional(),
});

/** Jira Cloud sites live on atlassian.net (spec section 8.2). */
export function looksLikeJiraCloud(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith('.atlassian.net');
  } catch {
    return false;
  }
}
export const OpenLinkSchema = z.object({ url: z.string().max(2000) });
export const CopyTextSchema = z.object({ text: z.string().max(2000) });
export const OverlayGetFrameSchema = z.object({ displayId: z.string().max(64) });
export const RestoreDraftSchema = z.object({ requestId: RequestIdSchema });

export const AssigneeCandidateSchema = z.object({
  username: z.string().min(1).max(255),
  displayName: z.string().max(255),
  email: z.string().max(255).nullable(),
  avatarUrl: z.string().max(2000).nullable(),
});

export const ReviewStateSchema: z.ZodType<ReviewState> = z.object({
  projectKey: ProjectKeySchema,
  bugLanguage: BugLanguageSchema,
  prompt: z.string().max(MAX_PROMPT_CHARS),
  draft: BugDraftSchema,
  assignee: AssigneeCandidateSchema.nullable(),
  extraFields: z.record(z.string().regex(EXTRA_FIELD_ID), z.unknown()),
});

// ---- Jira Data Center REST API v2 responses (spec section 8, confirmed in T-002) ----

export const JiraMyselfSchema = z.object({
  // Data Center has `name`; Cloud has `accountId` (spec section 8.2).
  name: z.string().optional(),
  accountId: z.string().optional(),
  displayName: z.string(),
});

export const JiraProjectListSchema = z.array(z.object({ key: z.string(), name: z.string() }));

const pageMeta = {
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  total: z.number().optional(),
  isLast: z.boolean().optional(),
};

const IssueTypeItem = z.object({
  id: z.string(),
  name: z.string(),
  subtask: z.boolean().optional(),
});

/** Data Center lists under `values`, Cloud under `issueTypes` (spec section 8.2). */
export const JiraIssueTypePageSchema = z.object({
  ...pageMeta,
  values: z.array(IssueTypeItem).optional(),
  issueTypes: z.array(IssueTypeItem).optional(),
});

const FieldItem = z.object({
  fieldId: z.string(),
  name: z.string(),
  required: z.boolean(),
  hasDefaultValue: z.boolean().optional(),
  schema: z.object({ type: z.string(), items: z.string().optional() }).loose(),
  allowedValues: z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string().optional(),
          value: z.string().optional(),
        })
        .loose(),
    )
    .optional(),
});

/** Data Center lists under `values`, Cloud under `fields` (spec section 8.2). */
export const JiraFieldPageSchema = z.object({
  ...pageMeta,
  values: z.array(FieldItem).optional(),
  fields: z.array(FieldItem).optional(),
});
export type JiraField = z.infer<typeof FieldItem>;

export const JiraPriorityListSchema = z.array(z.object({ id: z.string(), name: z.string() }));

export const JiraUserListSchema = z.array(
  z.object({
    // Data Center identifies users by `name`, Cloud by `accountId` (spec section 8.2).
    name: z.string().optional(),
    accountId: z.string().optional(),
    accountType: z.string().optional(),
    displayName: z.string(),
    emailAddress: z.string().optional(),
    active: z.boolean().optional(),
    avatarUrls: z.record(z.string(), z.string()).optional(),
  }),
);

export const JiraSearchSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        summary: z.string().optional(),
        status: z.object({ name: z.string() }).optional(),
      }),
    }),
  ),
});

export const JiraCreatedSchema = z.object({ id: z.string(), key: z.string() });

export const JiraAttachmentListSchema = z.array(z.object({ id: z.string() }).loose());

export const JiraErrorBodySchema = z.object({
  errorMessages: z.array(z.string()).optional(),
  errors: z.record(z.string(), z.string()).optional(),
});

// ---- Anthropic Messages API response (spec section 7) ----

export const AnthropicResponseSchema = z.object({
  content: z.array(
    z.union([
      z.object({ type: z.literal('tool_use'), name: z.string(), input: z.unknown() }),
      z.object({ type: z.string() }).loose(),
    ]),
  ),
  stop_reason: z.string().nullable().optional(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

// ---- kill switch (spec section 11) ----

export const StatusFileSchema = z.object({
  aiDisabled: z.boolean().default(false),
  appDisabled: z.boolean().default(false),
  message: z.string().max(500).optional(),
  minimumVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/)
    .optional(),
});
export type StatusFile = z.infer<typeof StatusFileSchema>;

export const PermissionKindSchema = z.object({ kind: z.enum(['screen', 'microphone']) });
