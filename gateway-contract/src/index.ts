import { z } from 'zod';

// The contract between the app's GatewayProvider and the Spring Boot gateway (spec section 7,
// T-070 to T-073). The gateway's Java records mirror these shapes.

export const DRAFT_PATH = '/v1/draft';
export const TRANSCRIBE_PATH = '/v1/transcribe';

/** `payload` part of `POST /v1/draft`: DraftInput without the image. */
export const DraftPayloadSchema = z.object({
  prompt: z.string().max(2000),
  context: z.object({
    appName: z.string().max(200).nullable(),
    windowTitle: z.string().max(300).nullable(),
    os: z.string().max(100),
  }),
  bugLanguage: z.enum(['en', 'ar']),
  allowed: z.object({
    issueTypes: z.array(z.string().min(1).max(100)).min(1).max(50),
    priorities: z.array(z.string().max(20)).max(10),
  }),
});
export type DraftPayload = z.infer<typeof DraftPayloadSchema>;

/** Error body of every non-2xx gateway answer. */
export const GatewayErrorSchema = z.object({
  code: z.enum([
    'RATE_LIMITED',
    'COST_CAP_REACHED',
    'INVALID_REQUEST',
    'REQUEST_TOO_LARGE',
    'AI_UNAVAILABLE',
    'AI_INVALID_OUTPUT',
    'STT_NOT_CONFIGURED',
    'UNKNOWN',
  ]),
});
export type GatewayErrorCode = z.infer<typeof GatewayErrorSchema>['code'];

export const TranscriptSchema = z.object({ text: z.string().max(4000) });
