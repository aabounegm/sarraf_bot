import { z } from 'zod';

import { CURRENCY_CODES, CURRENCY_METHODS, type Currency } from './currencies.ts';

/**
 * A standing alert on one currency pair, written in the offer's own vocabulary: `giveCurrency` is
 * what a matching offer gives (what you want to receive), `getCurrency` what it wants (what you
 * would pay with). An empty method list means "any method", which is what most people want.
 */
export const AlertInput = z
  .object({
    giveCurrency: z.enum(CURRENCY_CODES),
    getCurrency: z.enum(CURRENCY_CODES),
    giveMethods: z.array(z.string().min(1)),
    getMethods: z.array(z.string().min(1)),
  })
  .refine((a) => a.giveCurrency !== a.getCurrency, {
    message: 'same-currency',
    path: ['getCurrency'],
  })
  .refine((a) => a.giveMethods.every((m) => CURRENCY_METHODS[a.giveCurrency].includes(m)), {
    message: 'unknown-method',
    path: ['giveMethods'],
  })
  .refine((a) => a.getMethods.every((m) => CURRENCY_METHODS[a.getCurrency].includes(m)), {
    message: 'unknown-method',
    path: ['getMethods'],
  });
export type AlertInput = z.infer<typeof AlertInput>;

interface Sides {
  giveCurrency: Currency;
  getCurrency: Currency;
  giveMethods: readonly string[];
  getMethods: readonly string[];
}

/** An empty method list on an alert means "any", so it overlaps with anything. */
const overlaps = (wanted: readonly string[], offered: readonly string[]) =>
  wanted.length === 0 || wanted.some((m) => offered.includes(m));

/** The one definition of "this offer is what they asked for": the pair, then the methods if named. */
export function matchesAlert(offer: Sides, alert: Sides): boolean {
  return (
    offer.giveCurrency === alert.giveCurrency &&
    offer.getCurrency === alert.getCurrency &&
    overlaps(alert.giveMethods, offer.giveMethods) &&
    overlaps(alert.getMethods, offer.getMethods)
  );
}

/** Inline-button payloads on an alert row, e.g. `alert:pause:3`. */
export const ALERT_BUTTONS = ['pause', 'resume', 'delete'] as const;
export type AlertButton = (typeof ALERT_BUTTONS)[number];

export const alertCallback = (button: AlertButton, alertId: number) => `alert:${button}:${alertId}`;
export const ALERT_CALLBACK = /^alert:([a-z]+):(\d+)$/;

export function parseAlertCallback(data: string): { button: AlertButton; alertId: number } | null {
  const m = ALERT_CALLBACK.exec(data);
  const button = m?.[1] as AlertButton | undefined;
  return button && ALERT_BUTTONS.includes(button) ? { button, alertId: Number(m![2]) } : null;
}

/** `[+ Add a pair]` on the `/alerts` list: no id yet, so it is not one of ALERT_BUTTONS. */
export const ALERT_NEW_CALLBACK = 'alert:new';
