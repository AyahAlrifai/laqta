import type { z } from 'zod';
import type { IpcResult } from '../shared/ipc-api';
import type { AppError } from '../shared/types';
import { appError, AppFailure } from './errors';
import { log } from './log';

// Pure core of the IPC layer (spec section 10): every call must come from the main frame of
// one of the app's own windows, and every payload must match its Zod schema. Kept free of
// Electron imports so it can be unit tested.

export interface SenderInfo {
  webContentsId: number;
  frameUrl: string | null;
  isMainFrame: boolean;
}

export interface GuardDeps {
  isOwnWindow: (webContentsId: number) => boolean;
  isOwnUrl: (url: string) => boolean;
}

export type Handler<P, R> = (payload: P, sender: SenderInfo) => Promise<R> | R;

export function invalidPayloadError(): AppError {
  return appError('UNKNOWN', { detail: 'invalid ipc payload' });
}

export function senderAllowed(sender: SenderInfo, deps: GuardDeps): boolean {
  return (
    sender.isMainFrame &&
    sender.frameUrl !== null &&
    deps.isOwnWindow(sender.webContentsId) &&
    deps.isOwnUrl(sender.frameUrl)
  );
}

/** Wraps a handler with sender checks, payload validation and the result envelope. */
export function guarded<P, R>(
  channel: string,
  schema: z.ZodType<P> | null,
  handler: Handler<P, R>,
  deps: GuardDeps,
): (sender: SenderInfo, raw: unknown) => Promise<IpcResult<R>> {
  return async (sender, raw) => {
    if (!senderAllowed(sender, deps)) {
      log('ipc.rejected', { channel, reason: 'sender' });
      return { ok: false, error: appError('FORBIDDEN', { detail: 'ipc sender rejected' }) };
    }
    let payload: P;
    if (schema === null) {
      if (raw !== undefined && raw !== null) {
        log('ipc.rejected', { channel, reason: 'unexpected payload' });
        return { ok: false, error: invalidPayloadError() };
      }
      payload = undefined as P;
    } else {
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        log('ipc.rejected', { channel, reason: 'schema' });
        return { ok: false, error: invalidPayloadError() };
      }
      payload = parsed.data;
    }
    try {
      return { ok: true, value: await handler(payload, sender) };
    } catch (error) {
      if (error instanceof AppFailure) return { ok: false, error: error.error };
      log('app.error', { channel, name: error instanceof Error ? error.name : 'unknown' });
      return { ok: false, error: appError('UNKNOWN') };
    }
  };
}
