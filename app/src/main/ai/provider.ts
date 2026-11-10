import type { BugDraft, BugLanguage } from '../../shared/types';

// Spec section 7, binding interfaces.
export interface DraftInput {
  imagePng: Uint8Array; // redacted, downscaled copy
  prompt: string; // typed or transcribed, max 2000 chars
  context: { appName: string | null; windowTitle: string | null; os: string };
  bugLanguage: BugLanguage;
  allowed: { issueTypes: string[]; priorities: string[] };
}

export interface DraftProvider {
  /** Throws `AppFailure` with AI_UNAVAILABLE, AI_INVALID_OUTPUT or CANCELLED. */
  draft(input: DraftInput, signal: AbortSignal): Promise<BugDraft>;
}

/** Spec section 7: 45 second timeout for a draft request. */
export const DRAFT_TIMEOUT_MS = 45_000;

/** Base64 for the image block. Lives here so providers in release builds need not import
 *  the direct (dev-only) provider. */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
