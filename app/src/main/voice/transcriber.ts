import { z } from 'zod';
import type { VoiceLanguage } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import type { FetchLike } from '../ai/provider';

// Spec section 6, binding interface. Audio stays in memory and is discarded after the call.
export interface Transcriber {
  transcribe(
    audio: Uint8Array,
    mime: string,
    language: VoiceLanguage,
    signal: AbortSignal,
  ): Promise<string>;
}

const TranscriptSchema = z.object({ text: z.string().max(4000) });

/** Posts to the gateway's `/v1/transcribe`; the speech service behind it is decision D-STT. */
export class GatewayTranscriber implements Transcriber {
  constructor(
    private readonly baseUrl: string,
    private readonly fetch: FetchLike,
    private readonly authHeader: () => Promise<string | null>,
  ) {}

  async transcribe(
    audio: Uint8Array,
    mime: string,
    language: VoiceLanguage,
    signal: AbortSignal,
  ): Promise<string> {
    const form = new FormData();
    form.append('audio', new Blob([new Uint8Array(audio)], { type: mime }), 'audio.webm');
    form.append('language', language);
    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = await this.authHeader();
    if (auth !== null) headers.Authorization = auth;
    let response: Response;
    try {
      response = await this.fetch(new URL('/v1/transcribe', this.baseUrl).toString(), {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
      });
    } catch {
      throw new AppFailure(appError(signal.aborted ? 'CANCELLED' : 'AI_UNAVAILABLE'));
    }
    if (!response.ok)
      throw new AppFailure(
        appError('AI_UNAVAILABLE', { detail: `http ${String(response.status)}` }),
      );
    const parsed = TranscriptSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) throw new AppFailure(appError('AI_INVALID_OUTPUT'));
    return parsed.data.text;
  }
}

/** Used when no speech service is configured: voice stays off and typing keeps working. */
export class UnavailableTranscriber implements Transcriber {
  transcribe(): Promise<string> {
    return Promise.reject(
      new AppFailure(appError('AI_UNAVAILABLE', { detail: 'no transcriber configured' })),
    );
  }
}
