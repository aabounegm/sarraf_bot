import type { ReactLocalization } from '@fluent/react';
import { type Currency, convert, formatAmount, rateInfo } from '@sarraf/shared';

import type { OfferSummary } from './model.ts';

type RateFields = Pick<OfferSummary, 'giveCurrency' | 'getCurrency' | 'rate' | 'negotiable'>;

export const amount = (minor: number, currency: Currency) => `${formatAmount(minor)} ${currency}`;

export function rateText(l10n: ReactLocalization, o: RateFields) {
  const info = rateInfo(o);
  if (info.kind === 'open') return l10n.getString('rate-open');
  return l10n.getString(`rate-${info.kind}`, {
    base: info.base,
    quote: info.quote,
    rate: formatAmount(info.rate * 100),
  });
}

/** "200 USDT → 19,300 RUB", or "200 USDT → RUB" when there is no rate. */
export function pairText(o: RateFields & { giveAmount: number }) {
  const give = amount(o.giveAmount, o.giveCurrency);
  if (o.rate === null) return `${give} → ${o.getCurrency}`;
  return `${give} → ${amount(convert(o.giveCurrency, o.getCurrency, o.rate, o.giveAmount), o.getCurrency)}`;
}

export const dealsText = (l10n: ReactLocalization, count: number) =>
  l10n.getString('deals', { count });

export function expiryText(l10n: ReactLocalization, expiresAt: number | null) {
  if (expiresAt === null) return l10n.getString('no-expiry');
  const hours = Math.max(0, Math.round((expiresAt - Date.now()) / 3_600_000));
  return l10n.getString('hours-left', { hours });
}

export function expiryDateText(l10n: ReactLocalization, expiresAt: number | null) {
  if (expiresAt === null) return l10n.getString('no-expiry');
  const when = new Intl.DateTimeFormat(l10n.getString('locale-tag'), {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(expiresAt);
  return l10n.getString('expires-at', { when });
}

/** Status line under an offer: availability, then requested/reserved contention if any. */
export function availabilityText(l10n: ReactLocalization, o: OfferSummary) {
  const { remaining, requested, reserved } = o.availability;
  const cur = o.giveCurrency;
  const main =
    remaining === o.giveAmount
      ? l10n.getString('available', { amount: amount(remaining, cur) })
      : l10n.getString('left-of', {
          left: formatAmount(remaining),
          total: amount(o.giveAmount, cur),
        });
  const extra = [
    reserved > 0 && l10n.getString('reserved', { amount: amount(reserved, cur) }),
    requested > 0 && l10n.getString('requested', { amount: amount(requested, cur) }),
  ].filter((x): x is string => Boolean(x));
  return { main, extra, partial: remaining !== o.giveAmount };
}
