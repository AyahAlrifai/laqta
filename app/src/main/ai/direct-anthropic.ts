import { AnthropicResponseSchema, BugDraftSchema } from '../../shared/schemas';
import type { BugDraft } from '../../shared/types';
import { appError, AppFailure, isAbortError } from '../errors';
import { log } from '../log';
import { BUG_DRAFT_JSON_SCHEMA, buildUserText, SYSTEM_PROMPT, TOOL_NAME } from './prompt';
import { DRAFT_TIMEOUT_MS, type DraftInput, type DraftProvider, type FetchLike } from './provider';

// Spec section 7. DEVELOPMENT ONLY: reads a developer key from the environment and must
// never ship in a release build (T-072 removes it from release bundles; CI checks for the
// key name in the bundle).

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const TIMEOUT_MS = DRAFT_TIMEOUT_MS;

export interface DirectAnthropicOptions {
  apiKey: string;
  model?: string;
  fetch: FetchLike;
  timeoutMs?: number;
}

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

export function buildRequestBody(input: DraftInput, model: string, validationErrors?: string) {
  return {
    model,
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: TOOL_NAME,
        description: 'Submit the Jira bug draft. This is the only way to answer.',
        input_schema: BUG_DRAFT_JSON_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: bytesToBase64(input.imagePng),
            },
          },
          { type: 'text', text: buildUserText(input, validationErrors) },
        ],
      },
    ],
  };
}

type Attempt = { kind: 'ok'; draft: BugDraft } | { kind: 'invalid'; errors: string };

export class DirectAnthropicProvider implements DraftProvider {
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: DirectAnthropicOptions) {
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? TIMEOUT_MS;
  }

  async draft(input: DraftInput, signal: AbortSignal): Promise<BugDraft> {
    const first = await this.attempt(input, signal);
    if (first.kind === 'ok') return first.draft;
    log('draft.retry', { reason: 'schema' });
    const second = await this.attempt(input, signal, first.errors);
    if (second.kind === 'ok') return second.draft;
    throw new AppFailure(
      appError('AI_INVALID_OUTPUT', { detail: 'schema validation failed twice' }),
    );
  }

  private async attempt(input: DraftInput, signal: AbortSignal, errors?: string): Promise<Attempt> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    let response: Response;
    try {
      response = await this.opts.fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.opts.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildRequestBody(input, this.model, errors)),
        signal: combined,
      });
    } catch (error) {
      throw this.networkFailure(error, signal);
    }
    if (!response.ok) {
      throw new AppFailure(
        appError('AI_UNAVAILABLE', { detail: `http ${String(response.status)}` }),
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      if (signal.aborted || isAbortError(error)) throw this.networkFailure(error, signal);
      return { kind: 'invalid', errors: 'response was not JSON' };
    }
    const parsed = AnthropicResponseSchema.safeParse(json);
    if (!parsed.success) return { kind: 'invalid', errors: 'unexpected response shape' };
    const block = parsed.data.content.find(
      (b): b is { type: 'tool_use'; name: string; input: unknown } =>
        b.type === 'tool_use' && 'name' in b && b.name === TOOL_NAME,
    );
    if (!block) return { kind: 'invalid', errors: `no ${TOOL_NAME} call in the answer` };
    const draft = BugDraftSchema.safeParse(block.input);
    if (!draft.success) {
      const issues = draft.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      return { kind: 'invalid', errors: issues };
    }
    return { kind: 'ok', draft: draft.data };
  }

  private networkFailure(error: unknown, userSignal: AbortSignal): AppFailure {
    if (userSignal.aborted) return new AppFailure(appError('CANCELLED'));
    const detail = isAbortError(error) ? 'timeout' : 'network';
    return new AppFailure(appError('AI_UNAVAILABLE', { detail }));
  }
}
