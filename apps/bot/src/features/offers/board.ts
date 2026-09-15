import { hears } from '@grammyjs/i18n';
import {
  BOARD_CALLBACK,
  CURRENCY_CODES,
  type Currency,
  boardCallback,
  parseBoardCallback,
  takeCallback,
} from '@sarraf/shared';
import { Composer, InlineKeyboard } from 'grammy';

import type { BotContext } from '../../bot/index.ts';
import { BOARD_COMMAND } from '../../bot/menu.ts';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/index.ts';
import { renderOffer } from './render.ts';
import { type OfferSummary, listOffers } from './service.ts';

/**
 * `/board` and `[Browse offers]`: the board, in the chat. One active offer at a time in one
 * message, edited in place as
 * you page or change the filter, so browsing the whole board costs the chat a single message. The
 * card is the channel post's own renderer and `[Take]` is the channel's Take, so this screen adds
 * navigation and nothing else.
 */
export function boardBot(db: Db, config: Config) {
  const board = new Composer<BotContext>();

  const open = async (ctx: BotContext) => {
    const view = render(ctx, db, config, null, 0);
    await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard });
  };
  board.command(BOARD_COMMAND, open);
  board.filter(hears('menu-browse'), open);

  board.callbackQuery(BOARD_CALLBACK, async (ctx) => {
    const parsed = parseBoardCallback(ctx.callbackQuery.data);
    if (!parsed) return ctx.answerCallbackQuery();
    const view = render(ctx, db, config, parsed.give, parsed.index);
    await ctx.answerCallbackQuery();
    // Tapping the filter you are already on renders the same message, which Telegram rejects.
    await ctx
      .editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.keyboard })
      .catch(() => undefined);
  });

  return board;
}

/**
 * The whole screen for one tap. The list is re-read every time rather than remembered, so nothing
 * here can show an offer that has since gone.
 */
function render(ctx: BotContext, db: Db, config: Config, give: Currency | null, index: number) {
  const offers = listOffers(db, give ? { give } : {});
  if (offers.length === 0) {
    return {
      text: `${ctx.t('no-offers')}\n${ctx.t('no-offers-hint')}`,
      keyboard: filters(ctx, new InlineKeyboard(), give, config),
    };
  }
  // Clamped, not wrapped: a stale index from a list that has shrunk lands on the last offer.
  const at = Math.min(Math.max(index, 0), offers.length - 1);
  const offer = offers[at]!;
  const keyboard = new InlineKeyboard();
  const step = (by: number) => boardCallback(give, (at + by + offers.length) % offers.length);
  if (offers.length > 1) keyboard.text(ctx.t('board-prev'), step(-1));
  if (takeable(offer, ctx.from?.id)) keyboard.text(ctx.t('take'), takeCallback(offer.id));
  if (offers.length > 1) keyboard.text(ctx.t('board-next'), step(1));
  return {
    text: `${ctx.t('board-position', { n: at + 1, total: offers.length })}\n${renderOffer(offer, ctx.t)}`,
    keyboard: filters(ctx, keyboard.row(), give, config),
  };
}

/** The two cases the mini app hides its own Take button in; the service refuses either way. */
const takeable = (offer: OfferSummary, viewerId: number | undefined) =>
  offer.poster.id !== viewerId && offer.availability.remaining > 0;

/** The mini app's "I'm looking for" chips, ticked like every other choice the bot offers. */
function filters(
  ctx: BotContext,
  keyboard: InlineKeyboard,
  give: Currency | null,
  config: Config,
): InlineKeyboard {
  const chips: [string, Currency | null][] = [
    [ctx.t('anything'), null],
    ...CURRENCY_CODES.map((code): [string, Currency | null] => [code, code]),
  ];
  chips.forEach(([label, value], n) => {
    keyboard.text(value === give ? `✓ ${label}` : label, boardCallback(value, 0));
    if (n % 4 === 3) keyboard.row();
  });
  return keyboard.row().webApp(ctx.t('open-app'), config.PUBLIC_URL);
}
