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
