import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  BOT_TOKEN: z.string().min(1),
  WEBAPP_URL: z.url(),
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

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return Env.parse(env);
}
