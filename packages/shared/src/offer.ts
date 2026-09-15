import { z } from 'zod';

import {
  CURRENCY_CODES,
  CURRENCY_METHODS,
  type Currency,
  EXPIRY_OPTIONS_HOURS,
  NOTE_MAX_LENGTH,
  rateBase,
} from './currencies.ts';
import type { Minor } from './money.ts';

export const OFFER_STATUSES = ['active', 'paused', 'completed', 'closed', 'expired'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const CLAIM_STATUSES = ['pending', 'confirmed', 'done', 'declined', 'cancelled'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export interface ClaimAmount {
  status: ClaimStatus;
  amount: Minor;
}

/**
 * The one place that defines what "available" means.
 * Pending requests reserve nothing; only confirmed claims reduce `remaining`.
 */
export function availability(giveAmount: Minor, claims: readonly ClaimAmount[]) {
  const sum = (status: ClaimStatus) =>
    claims.filter((c) => c.status === status).reduce((acc, c) => acc + c.amount, 0);
  const filled = sum('done');
  const reserved = sum('confirmed');
  const requested = sum('pending');
  return { filled, reserved, requested, remaining: giveAmount - filled - reserved };
}

const currency = z.enum(CURRENCY_CODES);
const methodList = z.array(z.string().min(1)).min(1);

/** What a poster submits to create or edit an offer. Amounts are minor units. */
export const OfferInput = z
  .object({
    giveCurrency: currency,
    giveAmount: z.number().int().positive(),
    giveMethods: methodList,
    getCurrency: currency,
    getMethods: methodList,
    /** "1 base = rate quote"; null = no rate given (implies negotiable). */
    rate: z.number().positive().nullable(),
    negotiable: z.boolean(),
    expiresInHours: z.union([z.literal(EXPIRY_OPTIONS_HOURS), z.null()]),
    note: z
      .string()
      .trim()
      .max(NOTE_MAX_LENGTH)
      .transform((s) => s || null)
      .nullable(),
  })
  .refine((o) => o.giveCurrency !== o.getCurrency, {
    message: 'same-currency',
    path: ['getCurrency'],
  })
  .refine((o) => o.giveMethods.every((m) => CURRENCY_METHODS[o.giveCurrency].includes(m)), {
    message: 'unknown-method',
    path: ['giveMethods'],
  })
  .refine((o) => o.getMethods.every((m) => CURRENCY_METHODS[o.getCurrency].includes(m)), {
    message: 'unknown-method',
    path: ['getMethods'],
  })
  .refine((o) => o.negotiable || o.rate !== null, { message: 'rate-required', path: ['rate'] });
export type OfferInput = z.infer<typeof OfferInput>;

/** What a taker submits to request part (or all) of an offer; `method` is one of `offer.getMethods`. */
export const ClaimInput = z.object({
  offerId: z.number().int().positive(),
  amount: z.number().int().positive(),
  method: z.string().min(1),
});
export type ClaimInput = z.infer<typeof ClaimInput>;

export type RateInfo =
  | { kind: 'fixed' | 'asking'; base: Currency; quote: Currency; rate: number }
  | { kind: 'open' };

/** How to present the rate; the UI localizes the wording. */
export function rateInfo(o: {
  giveCurrency: Currency;
  getCurrency: Currency;
  rate: number | null;
  negotiable: boolean;
}): RateInfo {
  if (o.rate === null) return { kind: 'open' };
  const base = rateBase(o.giveCurrency, o.getCurrency);
  const quote = base === o.giveCurrency ? o.getCurrency : o.giveCurrency;
  return { kind: o.negotiable ? 'asking' : 'fixed', base, quote, rate: o.rate };
}

/** Deep links: `t.me/<bot>/<app>?startapp=offer_1042` and `?start=take_1042` on the bot side. */
export type StartParam = { kind: 'offer' | 'take'; offerId: number };

export const startParam = (kind: StartParam['kind'], offerId: number) => `${kind}_${offerId}`;

export function parseStartParam(value: string | undefined): StartParam | null {
  const m = /^(offer|take)_(\d+)$/.exec(value ?? '');
  return m ? { kind: m[1] as StartParam['kind'], offerId: Number(m[2]) } : null;
}

/** Inline-button payloads on the bot's claim messages, e.g. `claim:confirm:42`. */
export const CLAIM_BUTTONS = [
  'confirm',
  'decline',
  'cancel',
  'release',
  'done',
  'dismiss',
] as const;
export type ClaimButton = (typeof CLAIM_BUTTONS)[number];

export const claimCallback = (button: ClaimButton, claimId: number) => `claim:${button}:${claimId}`;
export const CLAIM_CALLBACK = /^claim:([a-z]+):(\d+)$/;

export function parseClaimCallback(data: string): { button: ClaimButton; claimId: number } | null {
  const m = CLAIM_CALLBACK.exec(data);
  const button = m?.[1] as ClaimButton | undefined;
  return button && CLAIM_BUTTONS.includes(button) ? { button, claimId: Number(m![2]) } : null;
}

/**
 * Inline-button payloads on the bot's own offer cards (`/mine`) and on the scheduler's DMs,
 * e.g. `offer:pause:42`. `close` only asks; `closenow` closes and `keep` puts the card back,
 * because closing is final. `repost` revives an expired offer, `checkin` is "yes, still on".
 */
export const OFFER_BUTTONS = [
  'edit',
  'pause',
  'resume',
  'close',
  'closenow',
  'keep',
  'repost',
  'checkin',
] as const;
export type OfferButton = (typeof OFFER_BUTTONS)[number];

export const offerCallback = (button: OfferButton, offerId: number) => `offer:${button}:${offerId}`;
export const OFFER_CALLBACK = /^offer:([a-z]+):(\d+)$/;

export function parseOfferCallback(data: string): { button: OfferButton; offerId: number } | null {
  const m = OFFER_CALLBACK.exec(data);
  const button = m?.[1] as OfferButton | undefined;
  return button && OFFER_BUTTONS.includes(button) ? { button, offerId: Number(m![2]) } : null;
}

/** Link that opens the mini app on an offer; short name `app` is set in BotFather (docs/deployment.md). */
export const miniAppLink = (bot: string, kind: StartParam['kind'], offerId: number) =>
  `https://t.me/${bot}/app?startapp=${startParam(kind, offerId)}`;
