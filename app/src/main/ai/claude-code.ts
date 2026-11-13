import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { BugDraftSchema } from '../../shared/schemas';
import type { BugDraft } from '../../shared/types';
import { appError, AppFailure } from '../errors';
import { log } from '../log';
import { BUG_DRAFT_JSON_SCHEMA, buildUserText, SYSTEM_PROMPT, TOOL_NAME } from './prompt';
import { bytesToBase64, type DraftInput, type DraftProvider } from './provider';

// Spec section 7, ClaudeCodeProvider: runs the user's own Claude Code CLI, so drafts work
// without any AI key in the app. Chosen in Settings › AI (release and dev builds) or with
// LAQTA_AI_PROVIDER=claude-code (dev builds only).

/** The CLI adds a few seconds of start-up to every request. */
export const CLAUDE_CODE_TIMEOUT_MS = 90_000;

/** The spec's prompt asks for a tool call; in this channel the structured output is that call. */
export const STRUCTURED_OUTPUT_NOTE = `In this environment, ${TOOL_NAME} is provided as your structured output: return the draft as the structured output and nothing else.`;

export function buildClaudeArgs(model: string | undefined): string[] {
  const args = [
    '-p',
    '--input-format',
    'stream-json',
    '--output-format',
    'stream-json',
    '--verbose',
    // No tools, MCP servers, hooks or saved session: the CLI is only a model channel here.
    '--tools',
    '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--settings',
    JSON.stringify({ disableAllHooks: true }),
    '--system-prompt',
    `${SYSTEM_PROMPT}\n${STRUCTURED_OUTPUT_NOTE}`,
    '--json-schema',
    JSON.stringify(BUG_DRAFT_JSON_SCHEMA),
  ];
  if (model !== undefined && model !== '') args.push('--model', model);
  return args;
}

/** One stream-json user message: the same image and text blocks as the direct provider. */
export function buildStdinMessage(input: DraftInput, validationErrors?: string): string {
  const message = {
    type: 'user',
    message: {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: bytesToBase64(input.imagePng) },
        },
        { type: 'text', text: buildUserText(input, validationErrors) },
      ],
    },
  };
  return `${JSON.stringify(message)}\n`;
}

const ResultEventSchema = z.object({
  type: z.literal('result'),
  subtype: z.string(),
  is_error: z.boolean().optional(),
  structured_output: z.unknown().optional(),
});

export type ParsedOutput =
  | { kind: 'ok'; draft: BugDraft }
  | { kind: 'invalid'; errors: string }
  | { kind: 'failed'; detail: string };

/** Reads the CLI's stream-json output. Lines are untrusted: anything unexpected is skipped. */
export function parseClaudeOutput(stdout: string): ParsedOutput {
  let result: z.infer<typeof ResultEventSchema> | null = null;
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = ResultEventSchema.safeParse(json);
    if (parsed.success) result = parsed.data;
  }
  if (result === null) return { kind: 'failed', detail: 'no result event' };
  if (result.is_error === true || result.subtype !== 'success') {
    // The subtype is a fixed CLI code (for example error_max_turns), safe to log.
    return { kind: 'failed', detail: `result ${result.subtype.slice(0, 40)}` };
  }
  if (result.structured_output === undefined) {
    return { kind: 'invalid', errors: 'no structured output in the answer' };
  }
  const draft = BugDraftSchema.safeParse(result.structured_output);
  if (!draft.success) {
    const issues = draft.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { kind: 'invalid', errors: issues };
  }
  return { kind: 'ok', draft: draft.data };
}

export interface RunResult {
  code: number | null;
  stdout: string;
}

/** Runs the CLI once. Rejects with the spawn error (ENOENT when it is not installed). */
export type RunClaude = (
  command: string,
  args: string[],
  stdin: string,
  signal: AbortSignal,
) => Promise<RunResult>;

export const runClaude: RunClaude = (command, args, stdin, signal) =>
  new Promise((resolve, reject) => {
    // An empty folder, so the CLI finds no project CLAUDE.md or settings to load.
    const cwd = mkdtempSync(join(tmpdir(), 'laqta-claude-'));
    const cleanup = () => rmSync(cwd, { recursive: true, force: true });
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'ignore'], signal });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', (error) => {
      cleanup();
      reject(error);
    });
    child.on('close', (code) => {
      cleanup();
      resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') });
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(stdin);
  });

/**
 * Apps started from Finder or the Dock do not get the shell PATH, so the usual install
 * locations are tried before falling back to a PATH lookup.
 */
export function resolveClaudeCommand(
  explicit: string | undefined,
  exists: (path: string) => boolean = existsSync,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  appData: string = process.env.APPDATA ?? join(home, 'AppData', 'Roaming'),
): string {
  if (explicit !== undefined && explicit !== '') return explicit;
  if (platform === 'win32') {
    // spawn without a shell cannot run the npm .cmd shim, so point at the claude.exe it wraps.
    // Native installer first, then `npm install -g @anthropic-ai/claude-code`.
    const candidates = [
      join(home, '.local', 'bin', 'claude.exe'),
      join(appData, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    ];
    return candidates.find((path) => exists(path)) ?? 'claude.exe';
  }
  const candidates = [
    join(home, '.local', 'bin', 'claude'),
    join(home, '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return candidates.find((path) => exists(path)) ?? 'claude';
}

export interface ClaudeCodeOptions {
  command: string;
  model?: string;
  run?: RunClaude;
  timeoutMs?: number;
}

export class ClaudeCodeProvider implements DraftProvider {
  private readonly run: RunClaude;
  private readonly timeoutMs: number;

  constructor(private readonly opts: ClaudeCodeOptions) {
    this.run = opts.run ?? runClaude;
    this.timeoutMs = opts.timeoutMs ?? CLAUDE_CODE_TIMEOUT_MS;
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

  private async attempt(
    input: DraftInput,
    signal: AbortSignal,
    errors?: string,
  ): Promise<{ kind: 'ok'; draft: BugDraft } | { kind: 'invalid'; errors: string }> {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]);
    let result: RunResult;
    try {
      result = await this.run(
        this.opts.command,
        buildClaudeArgs(this.opts.model),
        buildStdinMessage(input, errors),
        combined,
      );
    } catch (error) {
      if (signal.aborted) throw new AppFailure(appError('CANCELLED'));
      if (combined.aborted) throw new AppFailure(appError('AI_UNAVAILABLE', { detail: 'timeout' }));
      const code = (error as NodeJS.ErrnoException).code;
      const detail = code === 'ENOENT' ? 'claude cli not found' : 'claude cli failed to start';
      throw new AppFailure(appError('AI_UNAVAILABLE', { detail }));
    }
    if (signal.aborted) throw new AppFailure(appError('CANCELLED'));
    const parsed = parseClaudeOutput(result.stdout);
    if (parsed.kind === 'failed' || (result.code !== 0 && parsed.kind !== 'ok')) {
      const detail = parsed.kind === 'failed' ? parsed.detail : `exit ${String(result.code)}`;
      throw new AppFailure(appError('AI_UNAVAILABLE', { detail }));
    }
    return parsed;
  }
}
