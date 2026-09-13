import { createHmac, timingSafeEqual } from 'node:crypto';

import { createMiddleware } from 'hono/factory';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

function hmac(key: Buffer | string, data: string) {
  return createHmac('sha256', key).update(data);
}

/** Produces `initData` signed like Telegram does — used by the dev endpoint (and tests). */
export function signInitData(user: TelegramUser, botToken: string): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify(user),
  });
  params.sort();
  const dataCheckString = [...params].map(([k, v]) => `${k}=${v}`).join('\n');
  params.set('hash', hmac(hmac('WebAppData', botToken).digest(), dataCheckString).digest('hex'));
  return params.toString();
}

/**
 * Verifies Telegram Mini App `initData` (HMAC-SHA256 per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
 * and returns the embedded user, or null if invalid or older than `maxAgeSec`.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 3600,
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  params.sort();
  const dataCheckString = [...params].map(([k, v]) => `${k}=${v}`).join('\n');
  const expected = hmac(hmac('WebAppData', botToken).digest(), dataCheckString).digest('hex');
  if (
    expected.length !== hash.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
  ) {
    return null;
  }
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  const user = params.get('user');
  return user ? (JSON.parse(user) as TelegramUser) : null;
}

export type AuthEnv = { Variables: { user: TelegramUser } };

/** Expects `Authorization: tma <initData>`; sets `c.get('user')` or responds 401. */
export const telegramAuth = (botToken: string) =>
  createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const user = header.startsWith('tma ') ? verifyInitData(header.slice(4), botToken) : null;
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    c.set('user', user);
    await next();
  });
