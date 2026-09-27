/** Order matters: the earlier currency is the rate base ("1 USDT = 96.5 RUB"). */
export const CURRENCY_CODES = ['USDT', 'USD', 'EUR', 'AED', 'EGP', 'RUB'] as const;
export type Currency = (typeof CURRENCY_CODES)[number];

/** Payment methods (networks for USDT) a user can pick for each currency. */
export const CURRENCY_METHODS: Record<Currency, readonly string[]> = {
  USDT: ['ByBit', 'Binance', 'TRC20', 'TON', 'BEP20', 'ERC20'],
  USD: ['Cash', 'Wise', 'ACH', 'Zelle'],
  EUR: ['Cash', 'SEPA', 'Revolut'],
  AED: ['Cash', 'Bank transfer'],
  RUB: ['SBP', 'Tinkoff', 'Sber', 'Cash'],
  EGP: ['InstaPay', 'Vodafone Cash', 'Cash'],
};

/** Shown next to the code in pickers and filters, so the eye finds a currency without reading. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USDT: '₮',
  USD: '$',
  EUR: '€',
  AED: 'Dh',
  RUB: '₽',
  EGP: 'E£',
};

export const currencyLabel = (code: Currency) => `${code} (${CURRENCY_SYMBOLS[code]})`;

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value);
}

export function rateBase(a: Currency, b: Currency): Currency {
  return CURRENCY_CODES.indexOf(a) <= CURRENCY_CODES.indexOf(b) ? a : b;
}

/** A rate is always quoted "1 base = rate quote", whichever way the offer is written. */
export function ratePair(give: Currency, get: Currency): { base: Currency; quote: Currency } {
  const base = rateBase(give, get);
  return { base, quote: base === give ? get : give };
}

/** Expiry choices in hours. `null` (no expiry) is also allowed; the bot then pings the poster every 48h. */
export const EXPIRY_OPTIONS_HOURS = [6, 12, 24, 48] as const;
export type ExpiryHours = (typeof EXPIRY_OPTIONS_HOURS)[number];
export const NOTE_MAX_LENGTH = 200;
export const COMMUNITY_TIMEZONE = 'Europe/Moscow';
