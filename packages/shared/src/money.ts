import { type Currency, rateBase } from './currencies.ts';

/**
 * Amounts are integers in minor units (1/100) everywhere — DB, API, bot, mini app.
 * Only the edges (user input, display) convert to and from decimals.
 */
export type Minor = number;

export const toMinor = (decimal: number): Minor => Math.round(decimal * 100);
export const fromMinor = (minor: Minor): number => minor / 100;

/** Rate is always "1 base = rate quote" where base = rateBase(give, get). */
export function convert(give: Currency, get: Currency, rate: number, giveAmount: Minor): Minor {
  return Math.round(rateBase(give, get) === give ? giveAmount * rate : giveAmount / rate);
}

export function formatAmount(minor: Minor, locale = 'en-US'): string {
  const n = fromMinor(minor);
  return n.toLocaleString(locale, { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}
