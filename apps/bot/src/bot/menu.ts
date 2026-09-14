import { hears } from '@grammyjs/i18n';
import { Composer, InlineKeyboard, Keyboard } from 'grammy';

import type { Config } from '../config.ts';
import type { BotContext } from './index.ts';

/**
 * The four buttons from spec § B. "Browse offers" is a `web_app` button, so it opens the mini app
 * in one tap; the other three are plain text, matched with `hears` in the slice that owns them.
 */
const MENU_KEYS = ['menu-browse', 'new-offer', 'nav-my-offers', 'menu-help'] as const;

/** The one command that already says "cancelled" itself, so a wizard leaving on it stays quiet. */
export const CANCEL_COMMAND = 'cancel';

export const menuKeyboard = (ctx: BotContext, url: string) =>
  new Keyboard()
    .webApp(ctx.t('menu-browse'), url)
    .text(ctx.t('new-offer'))
    .row()
    .text(ctx.t('nav-my-offers'))
    .text(ctx.t('menu-help'))
    .resized()
    .persistent();

/** A wizard must hand these back instead of reading them as an answer (see bot/wizard.ts). */
export function isMenuText(ctx: { t(key: string): string }, text: string): boolean {
  return MENU_KEYS.some((key) => ctx.t(key) === text);
}

/** `/start`, `/help`, `/board`, `/cancel`: the parts of the chat that belong to no feature. */
export function menuBot(config: Config) {
  const menu = new Composer<BotContext>();

  // Registered last, so a deep link (`/start take_42`) has already been handled by its own slice.
  menu.command('start', (ctx) =>
    ctx.reply(
      ctx.t('start', {
        name: ctx.from?.first_name ?? '',
        bot: ctx.me.username,
        channel: config.OFFERS_CHANNEL,
      }),
      { reply_markup: menuKeyboard(ctx, config.PUBLIC_URL) },
    ),
  );

  const help = (ctx: BotContext) => ctx.reply(ctx.t('help', { channel: config.OFFERS_CHANNEL }));
  menu.command('help', help);
  menu.filter(hears('menu-help'), help);

  menu.command('board', (ctx) =>
    ctx.reply(ctx.t('board-hint'), {
      reply_markup: new InlineKeyboard().webApp(ctx.t('open-app'), config.PUBLIC_URL),
    }),
  );

  menu.command(CANCEL_COMMAND, async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.reply(ctx.t('wizard-cancelled'));
  });

  return menu;
}
