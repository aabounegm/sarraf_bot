/** Error codes are message ids: `own-offer` → `error-own-offer`, like the mini app's `apiErrorText`. */
export function errorText(
  ctx: { t(key: string, vars?: Record<string, string | number>): string },
  err: unknown,
  vars: Record<string, string | number> = {},
): string {
  // A wizard hands the code across `conversation.external`, where an Error would not survive.
  const code = err instanceof AppError ? err.code : typeof err === 'string' ? err : null;
  if (code === null) return ctx.t('error-generic');
  const text = ctx.t(`error-${code}`, vars);
  return text.startsWith('{') ? ctx.t('error-generic') : text; // Fluent renders "{id}" when missing
}

/** The code of a domain error, or `null` for anything we did not raise ourselves. */
export const errorCode = (err: unknown) => (err instanceof AppError ? err.code : null);

/** A domain error with a stable code; the API maps it to `status`, the bot to a localized message. */
export class AppError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  readonly code: string;

  constructor(status: 400 | 403 | 404 | 409, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
