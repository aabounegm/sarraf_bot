import {
  type ConversationFlavor,
  conversations,
  createConversation,
} from '@grammyjs/conversations';
import type { I18nFlavor } from '@grammyjs/i18n';
import { type ApiClientOptions, Bot, type Context, type SessionFlavor, session } from 'grammy';

import type { Config } from '../config.ts';
import type { Db } from '../db/index.ts';
import { claimsBot } from '../features/claims/bot.ts';
import { TAKE_WIZARD, takeWizard } from '../features/claims/wizard.ts';
import { boardBot } from '../features/offers/board.ts';
import { offersBot } from '../features/offers/bot.ts';
import { OFFER_WIZARD, offerWizard } from '../features/offers/wizard.ts';
import { i18n } from './i18n.ts';
import { menuBot } from './menu.ts';
import { sqliteStorage } from './session.ts';
import type { WizardContext } from './wizard.ts';

/** Grows per feature. `__language_code` is written by @grammyjs/i18n (useSession). */
export interface SessionData {
  __language_code?: string;
}

export type BotContext = ConversationFlavor<Context & SessionFlavor<SessionData> & I18nFlavor>;

/**
 * `client` is how tests intercept Telegram: a conversation builds its own `Api` from the token and
 * these options, so a transformer on `bot.api` would not see anything a wizard sends.
 */
export function createBot(config: Config, db: Db, client?: ApiClientOptions) {
  const bot = new Bot<BotContext>(config.BOT_TOKEN, { client });

  bot.use(session({ initial: (): SessionData => ({}), storage: sqliteStorage<SessionData>(db) }));
  bot.use(i18n);
  bot.use(
    conversations<BotContext, WizardContext>({
      // Same table as the session, hence the prefix: both are keyed by chat id.
      storage: { type: 'key', prefix: 'conversation-', adapter: sqliteStorage(db) },
      // Conversations run outside the middleware stack, so they get their own copy of the plugins.
      plugins: [i18n],
    }),
  );

  // Registered before anything that enters them: `enter` only knows conversations it has seen.
  bot.use(createConversation(offerWizard(db, config), OFFER_WIZARD));
  bot.use(createConversation(takeWizard(db), TAKE_WIZARD));

  bot.use(claimsBot(db));
  bot.use(offersBot(db, config));
  bot.use(boardBot(db, config));
  bot.use(menuBot(config));

  // Every callback is answered, including a button whose wizard or message is long gone.
  bot.on('callback_query', (ctx) => ctx.answerCallbackQuery(ctx.t('already-closed')));

  bot.catch((err) => console.error('bot error', err.error));
  return bot;
}
