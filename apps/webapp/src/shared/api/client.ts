import type { ReactLocalization } from '@fluent/react';
import type { Api } from '@sarraf/bot/api';
import { retrieveRawInitData } from '@telegram-apps/sdk-react';
import { hc } from 'hono/client';

/** Typed client for the bot's Hono API — routes and payload types come from the server code. */
export const api = hc<Api>('/api', {
  headers: () => ({ authorization: `tma ${retrieveRawInitData() ?? ''}` }),
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** JSON body on 2xx, `ApiError` with the server's error code otherwise. */
export async function unwrap<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new ApiError(res.status, body.error ?? 'internal');
}

/** Server error codes are message ids: `amount-exceeds-remaining` → `error-amount-exceeds-remaining`. */
export function apiErrorText(
  l10n: ReactLocalization,
  error: unknown,
  vars: Record<string, string | number> = {},
): string {
  const fallback = l10n.getString('error-generic');
  if (!(error instanceof ApiError)) return fallback;
  return l10n.getString(`error-${error.code}`, vars, fallback);
}
