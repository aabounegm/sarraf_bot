import { createHash } from 'node:crypto';

import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  BOT_TOKEN: z.string().min(1),
  /** HTTPS origin of this bot: mini app at `/`, API at `/api`, webhook at `/webhook`. */
  PUBLIC_URL: z.url(),
  /** `polling` for development; `webhook` registers `${PUBLIC_URL}/webhook` on boot. */
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  OFFERS_CHANNEL: z.string().min(1),
  MEMBER_CHATS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  DATABASE_PATH: z.string().default('./data/sarraf.db'),
  PORT: z.coerce.number().int().default(3000),
});

export type Config = z.infer<typeof Env> & {
  /** Telegram echoes this in `X-Telegram-Bot-Api-Secret-Token`; derived from the token so nothing extra is configured. */
  webhookSecret: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.parse(env);
  return { ...parsed, webhookSecret: createHash('sha256').update(parsed.BOT_TOKEN).digest('hex') };
}
