import { hears } from '@grammyjs/i18n';
import {
  OFFER_CALLBACK,
  type OfferStatus,
  formatAmount,
  offerCallback,
  parseOfferCallback,
} from '@sarraf/shared';
import { Composer, InlineKeyboard } from 'grammy';

import type { BotContext } from '../../bot/index.ts';
import { MINE_COMMAND, NEW_COMMAND } from '../../bot/menu.ts';
import { enterWizard } from '../../bot/wizard.ts';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/index.ts';
import { AppError, errorText } from '../../lib/app-error.ts';
import { sendMyRequests } from '../claims/bot.ts';
import { esc, renderOffer } from './render.ts';
import { type OfferDetail, applyOfferAction, getOffer, listOffersByPoster } from './service.ts';
import { OFFER_WIZARD } from './wizard.ts';

const newOffer = (ctx: BotContext) => enterWizard(ctx, OFFER_WIZARD);

/** Offers you can still do something about; the rest of your history is in the mini app. */
const RUNNING: OfferStatus[] = ['active', 'paused'];

/** `/new`, `/mine` and the buttons under a `/mine` card. The wizard itself is in wizard.ts. */
export function offersBot(db: Db, config: Config) {
  const offers = new Composer<BotContext>();

  offers.command(NEW_COMMAND, newOffer);
  offers.filter(hears('new-offer'), newOffer);

  const mine = (ctx: BotContext) => sendMine(ctx, db, config);
  offers.command(MINE_COMMAND, mine);
  offers.filter(hears('nav-my-offers'), mine);

  offers.callbackQuery(OFFER_CALLBACK, async (ctx) => {
    const parsed = parseOfferCallback(ctx.callbackQuery.data);
    if (!parsed) return ctx.answerCallbackQuery();
    const { button, offerId } = parsed;

    try {
      // These buttons only ever sit on your own card; read it once and say so if it is not yours,
      // because the card lists who has asked for what.
      const own = getOffer(db, offerId, ctx.from.id);
      if (own.poster.id !== ctx.from.id) throw new AppError(403, 'not-your-offer');

      if (button === 'edit') {
        await ctx.answerCallbackQuery();
        return await enterWizard(ctx, OFFER_WIZARD, offerId);
      }
      // Closing is final: the post goes, pending requests are declined. Ask, act on the second tap.
      if (button === 'close') {
        await ctx.answerCallbackQuery({ text: ctx.t('close-confirm'), show_alert: true });
        await ctx
          .editMessageReplyMarkup({ reply_markup: confirmClose(ctx, offerId) })
          .catch(() => undefined);
        return;
      }
      const offer =
        button === 'keep'
          ? own
          : applyOfferAction(db, ctx.from.id, offerId, button === 'closenow' ? 'close' : button);
      await ctx.answerCallbackQuery();
      await ctx.editMessageText(card(ctx, offer), {
        parse_mode: 'HTML',
        reply_markup: actions(ctx, offer),
      });
    } catch (err) {
      await ctx.answerCallbackQuery(errorText(ctx, err));
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    }
  });

  return offers;
}

/** One message per offer, then the requests you have made yourself (spec § B, `/mine`). */
async function sendMine(ctx: BotContext, db: Db, config: Config) {
  const offers = listOffersByPoster(db, ctx.from!.id).filter((o) => RUNNING.includes(o.status));
  if (offers.length > 0) await ctx.reply(ctx.t('posted-by-you'));
  for (const offer of offers) {
    await ctx.reply(card(ctx, offer), { parse_mode: 'HTML', reply_markup: actions(ctx, offer) });
  }
  const requests = await sendMyRequests(ctx, db);
  if (offers.length + requests === 0) {
    await ctx.reply(`${ctx.t('no-my-offers')}\n${ctx.t('no-requests')}`, {
      reply_markup: new InlineKeyboard().webApp(ctx.t('open-app'), config.PUBLIC_URL),
    });
  }
}

/** The offer as the channel shows it, plus the requests sitting on it. */
function card(ctx: BotContext, offer: OfferDetail): string {
  const open = offer.claims.filter((c) => c.status !== 'declined' && c.status !== 'cancelled');
  return [
    renderOffer(offer, ctx.t),
    ...open.map((claim) =>
      esc(
        ctx.t('mine-claim', {
          name: claim.taker.firstName,
          amount: `${formatAmount(claim.amount)} ${offer.giveCurrency}`,
          method: claim.method,
          status: ctx.t(claim.status === 'pending' ? 'asks-if-available' : `claim-${claim.status}`),
        }),
      ),
    ),
  ].join('\n');
}

function actions(ctx: BotContext, offer: OfferDetail): InlineKeyboard {
  const buttons = new InlineKeyboard();
  if (!RUNNING.includes(offer.status)) return buttons;
  const paused = offer.status === 'paused';
  return buttons
    .text(ctx.t('edit'), offerCallback('edit', offer.id))
    .text(ctx.t(paused ? 'resume' : 'pause'), offerCallback(paused ? 'resume' : 'pause', offer.id))
    .text(ctx.t('close'), offerCallback('close', offer.id));
}

const confirmClose = (ctx: BotContext, offerId: number) =>
  new InlineKeyboard()
    .text(ctx.t('close'), offerCallback('closenow', offerId))
    .text(ctx.t('cancel'), offerCallback('keep', offerId));
