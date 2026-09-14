import { COMMUNITY_TIMEZONE, convert, formatAmount, rateInfo } from '@sarraf/shared';

import type { OfferDetail } from './service.ts';

/** `ctx.t` in the bot, `i18n.t(locale, …)` where there is no context (the channel post). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const amountText = (minor: number, currency: string) => `${formatAmount(minor)} ${currency}`;

/**
 * One offer, as HTML. The channel post and the bot's own cards (`/mine`, the take wizard) are the
 * same text in different languages — the channel renders it in English, the bot in the reader's
 * locale. Kept in sync with docs/spec.md § Channel.
 */
export function renderOffer(o: OfferDetail, t: Translate): string {
  const lines = [
    `<b>${esc(
      t('channel-title', {
        name: o.poster.firstName,
        amount: formatAmount(o.giveAmount),
        give: o.giveCurrency,
        get: o.getCurrency,
      }),
    )}</b>`,
    esc(rateLine(o, t)),
    esc(t('channel-methods', { currency: o.giveCurrency, methods: o.giveMethods.join(', ') })),
    esc(t('channel-methods', { currency: o.getCurrency, methods: o.getMethods.join(', ') })),
  ];
  if (o.note) lines.push(`<i>${esc(o.note)}</i>`);
  lines.push(...statusLines(o, t).map(esc), esc(footer(o, t)));
  return lines.join('\n');
}

/** "1 USDT = 96.5 RUB ≈ 19,300 RUB" — the rate plus what the whole offer comes to. */
export function rateLine(o: OfferDetail, t: Translate): string {
  const info = rateInfo(o);
  if (info.kind === 'open') return t('rate-open');
  const rate = t(`rate-${info.kind}`, {
    base: info.base,
    quote: info.quote,
    rate: formatAmount(info.rate * 100),
  });
  const total = convert(o.giveCurrency, o.getCurrency, info.rate, o.giveAmount);
  return `${rate} ${t('channel-total', { total: formatAmount(total), currency: o.getCurrency })}`;
}

/** What a taker would pay for `amount`, or "Rate negotiable" when there is no rate. */
export function totalText(
  o: Pick<OfferDetail, 'giveCurrency' | 'getCurrency' | 'rate'>,
  amount: number,
  t: Translate,
): string {
  return o.rate === null
    ? t('rate-open')
    : amountText(convert(o.giveCurrency, o.getCurrency, o.rate, amount), o.getCurrency);
}

function statusLines(o: OfferDetail, t: Translate): string[] {
  if (o.status !== 'active') return [`● ${t(`status-${o.status}`)}`];
  const { remaining, reserved, requested } = o.availability;
  const partial = remaining !== o.giveAmount;
  const left = partial
    ? t('left-of', {
        left: formatAmount(remaining),
        total: amountText(o.giveAmount, o.giveCurrency),
      })
    : t('available', { amount: amountText(remaining, o.giveCurrency) });
  const contention = [
    reserved > 0 && t('reserved', { amount: amountText(reserved, o.giveCurrency) }),
    requested > 0 && t('awaiting-confirmation', { amount: amountText(requested, o.giveCurrency) }),
  ].filter((x): x is string => Boolean(x));
  return [
    `● ${t(partial ? 'status-partial' : 'status-active')} — ${left}`,
    ...(contention.length > 0 ? [contention.join(' · ')] : []),
  ];
}

/** A preview in the `/new` wizard has no id yet, so it has no `#1042` either. */
const footer = (o: OfferDetail, t: Translate) =>
  [
    o.id > 0 && `#${o.id}`,
    `${o.poster.firstName}, ${t('deals', { count: o.poster.deals })}`,
    expiryText(o.expiresAt, t),
  ]
    .filter(Boolean)
    .join(' · ');

/** "expires today 20:00" — in the community's timezone, not the reader's. */
export function expiryText(expiresAt: number | null, t: Translate): string {
  if (expiresAt === null) return t('no-expiry');
  const locale = t('locale-tag');
  const at = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: COMMUNITY_TIMEZONE, ...options });
  const date = at({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = Date.now();
  const day =
    date.format(expiresAt) === date.format(now)
      ? t('today')
      : date.format(expiresAt) === date.format(now + 86_400_000)
        ? t('tomorrow')
        : at({ weekday: 'short' }).format(expiresAt);
  return t('expires-at', {
    when: `${day} ${at({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(expiresAt)}`,
  });
}
