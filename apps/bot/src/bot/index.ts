import type { I18nFlavor } from '@grammyjs/i18n';
import { Bot, type Context, InlineKeyboard, type SessionFlavor, session } from 'grammy';

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { claimsBot } from '../features/claims/bot.ts';
import { i18n } from './i18n.ts';
import { sqliteStorage } from './session.ts';

/** Grows per feature. `__language_code` is written by @grammyjs/i18n (useSession). */
export interface SessionData {
  __language_code?: string;
}

export type BotContext = Context & SessionFlavor<SessionData> & I18nFlavor;

export function createBot(config: Config, db: Db) {
  const bot = new Bot<BotContext>(config.BOT_TOKEN);

  bot.use(session({ initial: (): SessionData => ({}), storage: sqliteStorage<SessionData>(db) }));
  bot.use(i18n);

  bot.use(claimsBot(db));

  bot.command('start', (ctx) =>
    ctx.reply(
      ctx.t('start', {
        name: ctx.from?.first_name ?? '',
        bot: ctx.me.username,
        channel: config.OFFERS_CHANNEL,
      }),
      { reply_markup: new InlineKeyboard().webApp(ctx.t('open-app'), config.PUBLIC_URL) },
    ),
  );

  bot.catch((err) => console.error('bot error', err.error));
  return bot;
}
