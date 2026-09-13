import type { ReactLocalization } from '@fluent/react';
import { type Currency, convert, formatAmount } from '@sarraf/shared';

import { amount } from '../offer/format.ts';
import type { OfferDetail } from '../offer/model.ts';
import type { Claim } from './model.ts';

/** "Your request: 100 USDT · 9,650 RUB via SBP" — the total is dropped when there is no rate. */
export function requestText(l10n: ReactLocalization, offer: OfferDetail, claim: Claim) {
  const total =
    offer.rate === null
      ? l10n.getString('rate-open')
      : amount(
          convert(offer.giveCurrency, offer.getCurrency, offer.rate, claim.amount),
          offer.getCurrency,
        );
  return l10n.getString('your-request', {
    amount: amount(claim.amount, offer.giveCurrency),
    total,
    method: claim.method,
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
