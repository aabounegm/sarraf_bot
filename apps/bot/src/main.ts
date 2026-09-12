import { serve } from '@hono/node-server';

import { createBot } from './bot/index.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { createHttp } from './http/index.ts';

const config = loadConfig();
const db = openDb(config.DATABASE_PATH);
const bot = createBot(config, db);
const http = createHttp(config, db);

serve({ fetch: http.fetch, port: config.PORT }, (info) =>
  console.log(`http listening on :${info.port}`),
);
bot.start({ onStart: (me) => console.log(`bot @${me.username} polling`) });

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => bot.stop());
