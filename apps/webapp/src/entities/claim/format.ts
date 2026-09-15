import type { ReactLocalization } from '@fluent/react';
import { type Currency, convert, formatAmount } from '@sarraf/shared';

import { amount } from '../offer/format.ts';
import type { OfferDetail } from '../offer/model.ts';
import type { Claim } from './model.ts';

/** What the claim comes to in the offer's get currency, or the reminder that the rate is open. */
const totalOf = (l10n: ReactLocalization, offer: OfferDetail, minor: number) =>
  offer.rate === null
    ? l10n.getString('rate-open')
    : amount(convert(offer.giveCurrency, offer.getCurrency, offer.rate, minor), offer.getCurrency);

/** "Your request: 100 USDT to TRC20 · 9,650 RUB via SBP" — the total goes when there is no rate. */
export function requestText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  return l10n.getString('your-request', {
    amount: amount(claim.amount, offer.giveCurrency),
    receive: claim.receiveMethod,
    total: totalOf(l10n, offer, claim.amount),
    method: claim.method,
  });
}

/** The same claim from the poster's side: what they are paid with, and where the taker wants it. */
export function claimMethodsText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  return l10n.getString('claim-methods', {
    total: totalOf(l10n, offer, claim.amount),
    method: claim.method,
    currency: offer.giveCurrency,
    receive: claim.receiveMethod,
  });
}

/** What a taker pays for `amount`, or the reminder that the rate is still open. */
export function payText(
  l10n: ReactLocalization,
  offer: {
    giveCurrency: Currency;
    getCurrency: Currency;
    rate: number | null;
    poster: { firstName: string };
  },
  minor: number,
) {
  if (offer.rate === null) return l10n.getString('rate-to-agree', { name: offer.poster.firstName });
  const total = convert(offer.giveCurrency, offer.getCurrency, offer.rate, minor);
  return l10n.getString('you-pay', {
    amount: `${formatAmount(total)} ${offer.getCurrency}`,
  });
}
