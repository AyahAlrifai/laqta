import { errorMessage, type UiLanguage } from '../shared/strings';
import type { AppError, AppErrorCode } from '../shared/types';

// `userMessage` always comes from strings.ts (spec section 4). `detail` is for the
// redacting logger only and must never hold tokens, image data or description text.

let language: UiLanguage = 'en';

export function setErrorLanguage(lang: UiLanguage): void {
  language = lang;
}

export function appError(
  code: AppErrorCode,
  extra: { detail?: string; fieldErrors?: Record<string, string> } = {},
): AppError {
  const error: AppError = { code, userMessage: errorMessage(language, code) };
  if (extra.detail !== undefined) error.detail = extra.detail.slice(0, 200);
  if (extra.fieldErrors !== undefined) error.fieldErrors = extra.fieldErrors;
  return error;
}

/** Thrown inside main-process services; IPC handlers turn it into a typed result. */
export class AppFailure extends Error {
  constructor(readonly error: AppError) {
    super(error.code);
    this.name = 'AppFailure';
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}
