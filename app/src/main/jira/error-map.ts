import { JiraErrorBodySchema } from '../../shared/schemas';
import type { AppError } from '../../shared/types';
import { appError } from '../errors';

// Spec section 8, error mapping table.

export function mapStatus(status: number, body: unknown): AppError {
  if (status === 401) return appError('AUTH_INVALID', { detail: 'http 401' });
  if (status === 403) return appError('FORBIDDEN', { detail: 'http 403' });
  if (status === 404) return appError('NOT_FOUND', { detail: 'http 404' });
  if (status === 413) return appError('ATTACHMENT_TOO_LARGE', { detail: 'http 413' });
  if (status === 429) return appError('RATE_LIMITED', { detail: 'http 429' });
  if (status >= 500) return appError('SERVER_ERROR', { detail: `http ${String(status)}` });
  if (status === 400) {
    const parsed = JiraErrorBodySchema.safeParse(body);
    const fieldErrors: Record<string, string> = {};
    if (parsed.success) {
      for (const [field, message] of Object.entries(parsed.data.errors ?? {})) {
        fieldErrors[field.slice(0, 100)] = message.slice(0, 300);
      }
    }
    return appError('FIELD_ERROR', { detail: 'http 400', fieldErrors });
  }
  return appError('UNKNOWN', { detail: `http ${String(status)}` });
}

export type NetworkClass =
  | { code: 'TLS_ERROR'; sent: false }
  | { code: 'NETWORK_UNREACHABLE'; sent: false }
  | { code: 'NETWORK_UNREACHABLE'; sent: 'unknown' };

function errorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth++) {
    if (current instanceof Error) {
      parts.push(current.name, current.message);
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string') parts.push(code);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === 'object') {
      const code = (current as { code?: unknown }).code;
      if (typeof code === 'string') parts.push(code);
      current = undefined;
    } else {
      current = undefined;
    }
  }
  return parts.join(' ');
}

/**
 * Classifies a thrown fetch error. `sent: false` means the request certainly never reached
 * Jira (DNS, refused, certificate), so a create is safe to retry; `sent: 'unknown'` means
 * Jira may have processed it (timeout, reset after sending), so a create must be verified.
 * Covers Node fetch causes and Electron `net::ERR_*` messages.
 */
export function classifyNetworkError(error: unknown): NetworkClass {
  const text = errorText(error);
  if (/CERT|SSL|TLS|ERR_BAD_SSL|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/i.test(text)) {
    return { code: 'TLS_ERROR', sent: false };
  }
  if (
    /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|NAME_NOT_RESOLVED|CONNECTION_REFUSED|ADDRESS_UNREACHABLE|INTERNET_DISCONNECTED|NETWORK_CHANGED|PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED/i.test(
      text,
    )
  ) {
    return { code: 'NETWORK_UNREACHABLE', sent: false };
  }
  return { code: 'NETWORK_UNREACHABLE', sent: 'unknown' };
}

export function networkError(error: unknown): AppError {
  const c = classifyNetworkError(error);
  return appError(c.code, { detail: c.sent === false ? 'not sent' : 'outcome unknown' });
}
