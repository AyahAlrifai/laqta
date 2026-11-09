import { DRAFT_PATH, DraftPayloadSchema, GatewayErrorSchema } from '@laqta/gateway-contract';
import { BugDraftSchema } from '../../shared/schemas';
import type { AppErrorCode, BugDraft } from '../../shared/types';
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

const CODE_MAP: Record<string, AppErrorCode> = {
  RATE_LIMITED: 'RATE_LIMITED',
  COST_CAP_REACHED: 'RATE_LIMITED',
  AI_INVALID_OUTPUT: 'AI_INVALID_OUTPUT',
  INVALID_REQUEST: 'UNKNOWN',
  REQUEST_TOO_LARGE: 'ATTACHMENT_TOO_LARGE',
};

export class GatewayProvider implements DraftProvider {
  constructor(private readonly opts: GatewayOptions) {}

  async draft(input: DraftInput, signal: AbortSignal): Promise<BugDraft> {
    const payload = DraftPayloadSchema.parse({
      prompt: input.prompt,
      context: input.context,
      bugLanguage: input.bugLanguage,
      allowed: input.allowed,
    });
    const form = new FormData();
    form.append(
      'image',
      new Blob([new Uint8Array(input.imagePng)], { type: 'image/png' }),
      'image.png',
    );
    form.append('payload', new Blob([JSON.stringify(payload)], { type: 'application/json' }));

    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = await this.opts.authHeader();
    if (auth !== null) headers.Authorization = auth;

    let response: Response;
    try {
      response = await this.opts.fetch(new URL(DRAFT_PATH, this.opts.baseUrl).toString(), {
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
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = GatewayErrorSchema.safeParse(body);
      const code = parsed.success
        ? (CODE_MAP[parsed.data.code] ?? 'AI_UNAVAILABLE')
        : 'AI_UNAVAILABLE';
      throw new AppFailure(appError(code, { detail: `gateway ${String(response.status)}` }));
    }
    const draft = BugDraftSchema.safeParse(body);
    if (!draft.success) throw new AppFailure(appError('AI_INVALID_OUTPUT'));
    return draft.data;
  }
}
