import type { BugDraft } from '../../shared/types';
import type { DraftInput, DraftProvider } from './provider';
import { enforceAllowed, sanitizeDraft } from './sanitize';

/** Provider output is validated by the provider, then sanitized and constrained here. */
export async function requestDraft(
  provider: DraftProvider,
  input: DraftInput,
  signal: AbortSignal,
  jiraHost: string | null,
): Promise<BugDraft> {
  const raw = await provider.draft(input, signal);
  return enforceAllowed(sanitizeDraft(raw, jiraHost), input.allowed);
}
