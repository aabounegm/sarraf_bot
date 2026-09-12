/** Order matters: the earlier currency is the rate base ("1 USDT = 96.5 RUB"). */
export const CURRENCY_CODES = ['USDT', 'USD', 'EUR', 'AED', 'RUB', 'EGP'] as const;
export type Currency = (typeof CURRENCY_CODES)[number];

/** Payment methods (networks for USDT) a user can pick for each currency. */
export const CURRENCY_METHODS: Record<Currency, readonly string[]> = {
  USDT: ['ByBit', 'Binance', 'TRC20', 'TON', 'BEP20', 'ERC20'],
  USD: ['Cash', 'Wise', 'Zelle'],
  EUR: ['Cash', 'SEPA', 'Revolut'],
  AED: ['Cash', 'Bank transfer'],
  RUB: ['SBP', 'Tinkoff', 'Sber', 'Cash'],
  EGP: ['InstaPay', 'Vodafone Cash', 'Cash'],
};

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value);
}

export function rateBase(a: Currency, b: Currency): Currency {
  return CURRENCY_CODES.indexOf(a) <= CURRENCY_CODES.indexOf(b) ? a : b;
}

/** Hours; `null` = no expiry (the bot then pings the poster every 48h). */
export const EXPIRY_OPTIONS_HOURS = [6, 12, 24, 48, null] as const;
export const NOTE_MAX_LENGTH = 200;
export const COMMUNITY_TIMEZONE = 'Europe/Moscow';
