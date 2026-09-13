import { CLAIM_CALLBACK, parseClaimCallback } from '@sarraf/shared';
import { Composer } from 'grammy';

import type { BotContext } from '../../bot/index.ts';
import type { Db } from '../../db/index.ts';
import { AppError } from '../../lib/app-error.ts';
import { applyClaimAction } from './service.ts';

/**
 * The buttons on claim messages. Every callback is answered, and a button on a claim that has
 * moved on says so instead of acting twice — the same message can sit in a chat for days.
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
      // The claim's own messages are re-rendered by the notifier, in both directions.
      return await ctx.answerCallbackQuery();
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      await ctx.answerCallbackQuery(ctx.t('already-closed'));
      await ctx.editMessageReplyMarkup().catch(() => undefined);
      return;
    }
  });
  return claims;
}
