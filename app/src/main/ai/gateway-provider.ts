import { BugDraftSchema } from '../../shared/schemas';
import type { BugDraft } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import { DRAFT_TIMEOUT_MS, type DraftInput, type DraftProvider, type FetchLike } from './provider';

// Spec section 7, release path: multipart `POST /v1/draft` with parts `image` (PNG) and
// `payload` (JSON of the other fields), answered with a BugDraft. How the gateway
// authenticates the employee is decision D-AUTH (spec section 15), so the header comes from
// an injected function.

export interface GatewayOptions {
  baseUrl: string;
  fetch: FetchLike;
  authHeader: () => Promise<string | null>;
  timeoutMs?: number;
}

export class GatewayProvider implements DraftProvider {
  constructor(private readonly opts: GatewayOptions) {}

  async draft(input: DraftInput, signal: AbortSignal): Promise<BugDraft> {
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(input.imagePng)], { type: 'image/png' }),
      'image.png',
    );
    const payload = {
      prompt: input.prompt,
      context: input.context,
      bugLanguage: input.bugLanguage,
      allowed: input.allowed,
    };
    form.append('payload', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = await this.opts.authHeader();
    if (auth !== null) headers.Authorization = auth;

    let response: Response;
    try {
      response = await this.opts.fetch(new URL('/v1/draft', this.opts.baseUrl).toString(), {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(this.opts.timeoutMs ?? DRAFT_TIMEOUT_MS),
        ]),
      });
    } catch {
      throw new AppFailure(appError(signal.aborted ? 'CANCELLED' : 'AI_UNAVAILABLE'));
    }
    if (response.status === 429) throw new AppFailure(appError('RATE_LIMITED'));
    if (response.status === 422) throw new AppFailure(appError('AI_INVALID_OUTPUT'));
    if (!response.ok) {
      throw new AppFailure(
        appError('AI_UNAVAILABLE', { detail: `http ${String(response.status)}` }),
      );
    }
    const parsed = BugDraftSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AppFailure(appError('AI_INVALID_OUTPUT'));
    return parsed.data;
  }
}
