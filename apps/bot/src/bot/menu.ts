import { hears } from '@grammyjs/i18n';
import { type Api, Composer, Keyboard } from 'grammy';
import type { LanguageCode } from 'grammy/types';

import type { Config } from '../config.ts';
import { i18n } from './i18n.ts';
import type { BotContext } from './index.ts';

/**
 * The four text buttons from spec § B, matched with `hears` in the slice that owns each. The
 * keyboard's fifth button opens the mini app and sends no message, so it is not one of these.
 */
const MENU_KEYS = ['menu-browse', 'new-offer', 'nav-my-offers', 'menu-help'] as const;

/**
 * Every command name, here and nowhere else — the handlers are spread over three files. Renaming
 * one is this line plus its `command-<name>` description in the three locales (`menu.test.ts`
 * fails if you forget). `/start` is not one of them: Telegram owns that name (`?start=<payload>`).
 */
export const NEW_COMMAND = 'new';
export const MINE_COMMAND = 'mine';
export const BOARD_COMMAND = 'board';
const HELP_COMMAND = 'help';
/** The one command that already says "cancelled" itself, so a wizard leaving on it stays quiet. */
export const CANCEL_COMMAND = 'cancel';

/**
 * Telegram's "/" menu and the list `/help` prints — one list, so the two cannot drift. `/start` is
 * not in it: the client offers it as a button before the chat begins, and after that the reply
 * keyboard is the way back to the menu.
 */
export const COMMANDS = [
  NEW_COMMAND,
  MINE_COMMAND,
  BOARD_COMMAND,
  HELP_COMMAND,
  CANCEL_COMMAND,
] as const;

const commandLines = (t: (key: string) => string) =>
  COMMANDS.map((command) => `/${command} — ${t(`command-${command}`)}`).join('\n');

/**
 * What Telegram itself shows before the user says anything: the "/" menu (one `setMyCommands` per
 * locale plus the English default, private chats only) and the button next to the message input.
 * Called at boot, not from `createBot`; a rejection is logged and nothing else — both are shortcuts
 * to things the chat already offers.
 */
export function registerMenu(api: Api, url: string) {
  const scope = { type: 'all_private_chats' } as const;
  const list = (locale: string) =>
    COMMANDS.map((command) => ({ command, description: i18n.t(locale, `command-${command}`) }));

  return Promise.all([
    api.setMyCommands(list('en'), { scope }),
    // The locales are the catalogue's file names, which is where Telegram's codes come from too.
    ...i18n.locales.map((locale) =>
      api.setMyCommands(list(locale), { scope, language_code: locale as LanguageCode }),
    ),
    // This takes the place of the commands button; the commands stay on typing "/". English for
    // everyone: unlike setMyCommands, there is one default button and no `language_code`.
    api.setChatMenuButton({
      menu_button: { type: 'web_app', text: i18n.t('en', 'menu-browse'), web_app: { url } },
    }),
  ]);
}

export const menuKeyboard = (ctx: BotContext, url: string) =>
  new Keyboard()
    .text(ctx.t('menu-browse'))
    .text(ctx.t('new-offer'))
    .row()
    .text(ctx.t('nav-my-offers'))
    .text(ctx.t('menu-help'))
    .row()
    .webApp(ctx.t('open-app'), url)
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

  const help = (ctx: BotContext) =>
    ctx.reply(
      ctx.t('help', {
        channel: config.OFFERS_CHANNEL,
        commands: commandLines((key) => ctx.t(key)),
      }),
    );
  menu.command(HELP_COMMAND, help);
  menu.filter(hears('menu-help'), help);

  menu.command(CANCEL_COMMAND, async (ctx) => {
    await ctx.conversation.exitAll();
    await ctx.reply(ctx.t('wizard-cancelled'));
  });

  return menu;
}
