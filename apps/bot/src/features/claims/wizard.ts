import { ClaimInput, formatAmount, ratePair, toMinor } from '@sarraf/shared';

import {
  type Wizard,
  type WizardContext,
  askText,
  choicesOf,
  choose,
  chunk,
} from '../../bot/wizard.ts';
import type { Db } from '../../db/index.ts';
import { errorCode, errorText } from '../../lib/app-error.ts';
import { claimRateText, renderOffer, totalText } from '../offers/render.ts';
import { type OfferDetail, getOffer } from '../offers/service.ts';
import { createClaim } from './service.ts';

export const TAKE_WIZARD = 'take-wizard';

/**
 * Amount → pay with → receive on → (rate, if the offer is negotiable) → confirm, from
 * `/start take_1042`. The mini app's take screen asks the same things and both end in
 * `createClaim`, which is what notifies the poster and
 * updates the channel post. The poster's @username is not shown here: it is earned by a confirmed
 * claim.
 */
export function takeWizard(db: Db) {
  return async (conversation: Wizard, ctx: WizardContext, offerId: number) => {
    const user = ctx.from!;
    const found = await conversation.external(() => takeable(db, offerId, user.id));
    if ('error' in found) return void ctx.reply(errorText(ctx, found.error));

    const offer = found.offer;
    const { remaining } = offer.availability;
    const max = `${formatAmount(remaining)} ${offer.giveCurrency}`;
    await ctx.reply(renderOffer(offer, ctx.t), { parse_mode: 'HTML' });

    const answer = await askText<number>(
      conversation,
      ctx,
      `${ctx.t('how-much', { currency: offer.giveCurrency })}\n${ctx.t('take-amount-hint', {
        max: ctx.t('max-amount', { amount: max }),
      })}`,
      (text) => {
        const value = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(value) || value <= 0) return { error: ctx.t('wizard-bad-amount') };
        return toMinor(value) > remaining
          ? { error: ctx.t('error-amount-exceeds-remaining', { amount: max }) }
          : { value: toMinor(value) };
      },
      [{ label: ctx.t('all-of', { amount: max }), value: 'all' }],
    );
    const amount = answer.kind === 'value' ? answer.value : remaining;

    const method = await choose(
      conversation,
      ctx,
      ctx.t('pay-with'),
      chunk(choicesOf(offer.getMethods), 2),
    );

    const receiveMethod = await choose(
      conversation,
      ctx,
      ctx.t('receive-with', { currency: offer.giveCurrency }),
      chunk(choicesOf(offer.giveMethods), 2),
    );

    const rate = offer.negotiable ? await rateOf(conversation, ctx, offer) : null;

    const name = offer.poster.firstName;
    // The only other button is [Cancel], which bot/wizard.ts halts on.
    await choose(
      conversation,
      ctx,
      [
        ctx.t('take-preview', {
          amount: `${formatAmount(amount)} ${offer.giveCurrency}`,
          id: offer.id,
          receive: receiveMethod,
          total: totalText(offer, amount, ctx.t, rate ?? offer.rate),
          method,
        }),
        ...(rate === null ? [] : [claimRateText(offer, rate, ctx.t)]),
        ctx.t('take-hint', { name }),
      ].join('\n'),
      [
        [
          {
            label: ctx.t('request-amount', {
              amount: `${formatAmount(amount)} ${offer.giveCurrency}`,
            }),
            value: 'send',
          },
        ],
      ],
    );
    const result = await conversation.external(() =>
      submit(db, user, { offerId: offer.id, amount, method, receiveMethod, rate }),
    );
    if ('error' in result) return void ctx.reply(errorText(ctx, result.error, { amount: max }));
    await ctx.reply(
      `${ctx.t('claim-waiting', { name })}\n${ctx.t('claim-waiting-hint', { name })}`,
    );
  };
}

// --- internals ---

/**
 * Only asked on a negotiable offer: the rate the taker is proposing, so a poster who finds it
 * insulting can decline from the DM instead of negotiating there. Skipping leaves the rate open.
 */
async function rateOf(
  conversation: Wizard,
  ctx: WizardContext,
  offer: OfferDetail,
): Promise<number | null> {
  const { base, quote } = ratePair(offer.giveCurrency, offer.getCurrency);
  const answer = await askText<number>(
    conversation,
    ctx,
    ctx.t('take-rate', { base, quote }),
    (text) => {
      const value = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
      return Number.isFinite(value) && value > 0 ? { value } : { error: ctx.t('wizard-bad-rate') };
    },
    [
      {
        label:
          offer.rate === null
            ? ctx.t('take-rate-later')
            : ctx.t('take-rate-theirs', { rate: formatAmount(offer.rate * 100) }),
        value: 'skip',
      },
    ],
  );
  return answer.kind === 'value' ? answer.value : null;
}

/** The same rules `createClaim` enforces, checked before asking three questions for nothing. */
function takeable(
  db: Db,
  offerId: number,
  takerId: number,
): { offer: OfferDetail } | { error: string } {
  try {
    const offer = getOffer(db, offerId, takerId);
    if (offer.poster.id === takerId) return { error: 'own-offer' };
    if (offer.status !== 'active' || offer.availability.remaining <= 0) {
      return { error: 'offer-unavailable' };
    }
    const mine = offer.claims.filter((c) => c.taker.id === takerId);
    if (mine.some((c) => c.status === 'pending' || c.status === 'confirmed')) {
      return { error: 'already-claimed' };
    }
    return { offer };
  } catch (err) {
    return { error: errorCode(err) ?? 'internal' };
  }
}

function submit(
  db: Db,
  user: { id: number; first_name: string; username?: string; language_code?: string },
  input: ClaimInput,
): { id: number } | { error: string } {
  try {
    const offer = createClaim(db, user, ClaimInput.parse(input));
    return { id: offer.id };
  } catch (err) {
    return { error: errorCode(err) ?? 'internal' };
  }
}
