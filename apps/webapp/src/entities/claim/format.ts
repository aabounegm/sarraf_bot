import type { ReactLocalization } from '@fluent/react';
import { type Currency, convert, formatAmount, ratePair } from '@sarraf/shared';

import { amount } from '../offer/format.ts';
import type { OfferDetail } from '../offer/model.ts';
import type { Claim } from './model.ts';

/**
 * What the claim comes to in the offer's get currency, or the reminder that the rate is open.
 * A claim on a negotiable offer may name its own rate, which then wins over the offer's.
 */
const totalOf = (
  l10n: ReactLocalization,
  offer: OfferDetail,
  minor: number,
  rate: number | null,
) =>
  rate === null
    ? l10n.getString('rate-open')
    : amount(convert(offer.giveCurrency, offer.getCurrency, rate, minor), offer.getCurrency);

/** "At 1 USDT = 90 RUB" — shown only when the taker proposed a rate of their own. */
export function claimRateText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  if (claim.rate === null) return null;
  const { base, quote } = ratePair(offer.giveCurrency, offer.getCurrency);
  return l10n.getString('claim-rate', { base, quote, rate: formatAmount(claim.rate * 100) });
}

/** "Your request: 100 USDT to TRC20 · 9,650 RUB via SBP" — the total goes when there is no rate. */
export function requestText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  return l10n.getString('your-request', {
    amount: amount(claim.amount, offer.giveCurrency),
    receive: claim.receiveMethod,
    total: totalOf(l10n, offer, claim.amount, claim.rate ?? offer.rate),
    method: claim.method,
  });
}

/** The same claim from the poster's side: what they are paid with, and where the taker wants it. */
export function claimMethodsText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  return l10n.getString('claim-methods', {
    total: totalOf(l10n, offer, claim.amount, claim.rate ?? offer.rate),
    method: claim.method,
    currency: offer.giveCurrency,
    receive: claim.receiveMethod,
  });
}

/**
 * What a taker pays for `amount`, or the reminder that the rate is still open. `rate` is the one
 * they are proposing on the take screen, which stands in for the offer's while they type it.
 */
export function payText(
  l10n: ReactLocalization,
  offer: {
    giveCurrency: Currency;
    getCurrency: Currency;
    rate: number | null;
    poster: { firstName: string };
  },
  minor: number,
  rate = offer.rate,
) {
  if (rate === null) return l10n.getString('rate-to-agree', { name: offer.poster.firstName });
  const total = convert(offer.giveCurrency, offer.getCurrency, rate, minor);
  return l10n.getString('you-pay', {
    amount: `${formatAmount(total)} ${offer.getCurrency}`,
  });
}
