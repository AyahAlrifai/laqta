import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Spec section 10: the logger accepts only a typed event name and a small metadata object
// (ids, durations, error codes). It refuses long strings and any field whose name suggests
// content, so tokens, images, prompts and descriptions can never reach the log.

export type LogEvent =
  | 'app.start'
  | 'app.quit'
  | 'app.error'
  | 'tray.ready'
  | 'hotkey.register'
  | 'hotkey.conflict'
  | 'capture.start'
  | 'capture.complete'
  | 'capture.cancel'
  | 'capture.failed'
  | 'session.discard'
  | 'session.transition'
  | 'session.rejected'
  | 'draft.request'
  | 'draft.success'
  | 'draft.failure'
  | 'draft.retry'
  | 'jira.request'
  | 'jira.response'
  | 'jira.create'
  | 'jira.verify'
  | 'jira.attach'
  | 'jira.projects'
  | 'ipc.rejected'
  | 'settings.load'
  | 'settings.save'
  | 'secrets.unavailable'
  | 'tempfiles.cleanup'
  | 'offline.save'
  | 'offline.expire'
  | 'update.check'
  | 'update.error'
  | 'killswitch.status'
  | 'telemetry.send'
  | 'voice.transcribe';

export type LogValue = string | number | boolean | null;
export type LogMeta = Record<string, LogValue>;

export const MAX_LOG_STRING = 200;
const FORBIDDEN_FIELD =
  /token|image|prompt|description|summary|password|secret|authorization|png|audio|transcript/i;

/** Returns a copy with forbidden or oversized values replaced. Exported for tests. */
export function scrubMeta(meta: LogMeta): LogMeta {
  const out: LogMeta = {};
  for (const [key, value] of Object.entries(meta)) {
    if (FORBIDDEN_FIELD.test(key)) {
      out[key] = '[refused]';
    } else if (typeof value === 'string' && value.length > MAX_LOG_STRING) {
      out[key] = '[refused: too long]';
    } else if (typeof value === 'string' && looksLikeSecret(value)) {
      out[key] = '[refused: secret-like]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Bearer headers and long opaque strings are dropped even under an innocent field name. */
function looksLikeSecret(value: string): boolean {
  // Jira REST paths (already stripped of their query) are long runs of the same characters
  // as an opaque token, but are endpoint names, not secrets.
  if (/^\/rest\/api\/[0-9]\/[A-Za-z0-9/_-]*$/.test(value)) return false;
  return (
    /bearer\s/i.test(value) ||
    /\bsk-[a-z0-9-_]{10,}/i.test(value) ||
    /^[A-Za-z0-9+/=_-]{40,}$/.test(value)
  );
}

export interface LogSink {
  write(line: string): void;
}

const MAX_FILE_BYTES = 1_000_000;
const KEEP_FILES = 3;

/** Size-rotated local file. Logs never leave the machine. */
export function fileSink(dir: string): LogSink {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'laqta.log');
  return {
    write(line) {
      try {
        if ((statSync(file, { throwIfNoEntry: false })?.size ?? 0) > MAX_FILE_BYTES) rotate(file);
        appendFileSync(file, line + '\n', { mode: 0o600 });
      } catch {
        // Logging must never crash the app.
      }
    },
  };
}

function rotate(file: string): void {
  for (let i = KEEP_FILES - 1; i >= 1; i--) {
    try {
      renameSync(`${file}.${String(i)}`, `${file}.${String(i + 1)}`);
    } catch {
      // missing older file is fine
    }
  }
  renameSync(file, `${file}.1`);
}

let sink: LogSink = { write: () => undefined };

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(event: LogEvent, meta: LogMeta = {}): void {
  // Metadata goes first so it can never overwrite the time or the event name.
  sink.write(JSON.stringify({ ...scrubMeta(meta), t: new Date().toISOString(), event }));
}
