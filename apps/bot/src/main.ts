import { serve } from '@hono/node-server';

import { createBot } from './bot/index.ts';
import { loadConfig } from './config.ts';
import { openDb } from './db/index.ts';
import { flushClaimNotifications, startClaimNotifications } from './features/claims/notify.ts';
import { flushChannelSync, startChannelSync } from './features/offers/channel.ts';
import { flushOfferNotifications, startOfferNotifications } from './features/offers/notify.ts';
import { createHttp } from './http/index.ts';
import { startScheduler } from './scheduler.ts';

const config = loadConfig();
const db = openDb(config.DATABASE_PATH);
const bot = createBot(config, db);
const http = createHttp(config, db, bot);

// getMe first: the channel post's deep link needs the bot's username, and the API must not
// accept an offer before the channel queue can publish it.
await bot.init();
startChannelSync({
  api: bot.api,
  db,
  chat: config.OFFERS_CHANNEL,
  botUsername: bot.botInfo.username,
});
startClaimNotifications({ api: bot.api, db });
startOfferNotifications({ api: bot.api, db });
// Last, because its first tick runs immediately and can expire, decline and post right away.
const scheduler = startScheduler(db);

const server = serve({ fetch: http.fetch, port: config.PORT }, (info) =>
  console.log(`http listening on :${info.port}`),
);

if (config.BOT_MODE === 'webhook') {
  await bot.api.setWebhook(`${config.PUBLIC_URL}/webhook`, { secret_token: config.webhookSecret });
  console.log(`bot @${bot.botInfo.username} receiving updates at ${config.PUBLIC_URL}/webhook`);
} else {
  // start() removes any webhook first, so switching back to polling needs no manual step.
  bot.start({ onStart: (me) => console.log(`bot @${me.username} polling`) });
}

// Handling the signal replaces Node's "just exit", so this must exit itself: the HTTP server
// keeps the event loop alive, and a process that lingers stops `node --watch` from restarting it
// (and leaves a bot that no longer polls).
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, async () => {
    server.close();
    clearInterval(scheduler);
    await bot.stop();
    // Let the last post and DM land instead of drifting until the next change.
    await Promise.all([flushChannelSync(), flushClaimNotifications(), flushOfferNotifications()]);
    process.exit(0);
  });
