import { CLAIM_CALLBACK, TAKE_CALLBACK, parseClaimCallback, parseStartParam } from '@sarraf/shared';
import { Composer } from 'grammy';

import type { BotContext } from '../../bot/index.ts';
import { enterWizard } from '../../bot/wizard.ts';
import type { Db } from '../../db/index.ts';
import { AppError } from '../../lib/app-error.ts';
import { claimCard, openClaimsOf, parties } from './card.ts';
import { applyClaimAction } from './service.ts';
import { TAKE_WIZARD } from './wizard.ts';

/**
 * The buttons on claim cards, wherever they sit. Every callback is answered, and a button on a
 * claim that has moved on says so instead of acting twice — the same message can sit in a chat for
 * days. The card that was tapped is re-rendered so it cannot keep offering an answer it no longer
 * has; the poster's request DM is handled by the notifier, from whichever surface changed it.
 */
export function claimsBot(db: Db) {
  const claims = new Composer<BotContext>();

  claims.callbackQuery(CLAIM_CALLBACK, async (ctx) => {
    const parsed = parseClaimCallback(ctx.callbackQuery.data);
    if (!parsed) return ctx.answerCallbackQuery();
    const { button, claimId } = parsed;

    // "Not yet": keep the message, drop the buttons — the mini app can still finish the deal.
    if (button === 'dismiss') {
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return ctx.answerCallbackQuery();
    }

    try {
      applyClaimAction(db, ctx.from.id, claimId, button);
      await ctx.answerCallbackQuery();
      await refresh(ctx, db, claimId);
      return;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      await ctx.answerCallbackQuery(ctx.t('already-closed'));
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return;
    }
  });

  // [Take] on a `/board` card — the same wizard the channel's link enters, one tap earlier.
  claims.callbackQuery(TAKE_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();
    await enterWizard(
      ctx,
      TAKE_WIZARD,
      Number(TAKE_CALLBACK.exec(ctx.callbackQuery.data ?? '')![1]),
    );
  });

  // The channel's [Take] button, bot half: `t.me/<bot>?start=take_1042`.
  claims.command('start', async (ctx, next) => {
    const param = parseStartParam(ctx.match);
    if (param?.kind !== 'take') return next();
    await enterWizard(ctx, TAKE_WIZARD, param.offerId);
  });

  return claims;
}

/** The "Your requests" half of `/mine`: one card per open request, with what it still allows. */
export async function sendMyRequests(ctx: BotContext, db: Db): Promise<number> {
  const ids = openClaimsOf(db, ctx.from!.id);
  if (ids.length > 0) await ctx.reply(ctx.t('your-requests'));
  for (const id of ids) {
    const p = parties(db, id);
    if (!p) continue;
    const card = claimCard(p, 'taker', ctx.t);
    await ctx.reply(card.text, { reply_markup: card.reply_markup });
  }
  return ids.length;
}

/**
 * The card the button was on, brought up to date. The poster's request DM is the notifier's job;
 * anything else (a `/mine` request, an older notification) is refreshed from the tapper's side.
 */
async function refresh(ctx: BotContext, db: Db, claimId: number) {
  const p = parties(db, claimId);
  const tapped = ctx.callbackQuery?.message?.message_id;
  if (!p || tapped === undefined || tapped === p.claim.posterMessageId) return;
  const role = ctx.from?.id === p.offer.poster.id ? 'poster' : 'taker';
  const card = claimCard(p, role, ctx.t);
  await ctx.editMessageText(card.text, { reply_markup: card.reply_markup }).catch(() => undefined);
}
