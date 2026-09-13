import { serve } from '@hono/node-server';

import { createBot } from './bot/index.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { createHttp } from './http/index.ts';

const config = loadConfig();
const db = openDb(config.DATABASE_PATH);
const bot = createBot(config, db);
const http = createHttp(config, db, bot);

serve({ fetch: http.fetch, port: config.PORT }, (info) =>
  console.log(`http listening on :${info.port}`),
);

if (config.BOT_MODE === 'webhook') {
  await bot.init();
  await bot.api.setWebhook(`${config.PUBLIC_URL}/webhook`, { secret_token: config.webhookSecret });
  console.log(`bot @${bot.botInfo.username} receiving updates at ${config.PUBLIC_URL}/webhook`);
} else {
  // start() removes any webhook first, so switching back to polling needs no manual step.
  bot.start({ onStart: (me) => console.log(`bot @${me.username} polling`) });
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => bot.stop());
