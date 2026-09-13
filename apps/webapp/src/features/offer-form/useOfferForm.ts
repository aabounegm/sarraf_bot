import {
  CURRENCY_CODES,
  CURRENCY_METHODS,
  type Currency,
  EXPIRY_OPTIONS_HOURS,
  type ExpiryHours,
  OfferInput,
  fromMinor,
  toMinor,
} from '@sarraf/shared';
import { useState } from 'react';

import type { OfferDetail } from '../../entities/offer/model.ts';

export interface OfferFormState {
  giveCurrency: Currency;
  giveAmount: string;
  giveMethods: string[];
  getCurrency: Currency;
  getMethods: string[];
  rate: string;
  negotiable: boolean;
  expiresInHours: ExpiryHours | null;
  note: string;
}

const otherCurrency = (than: Currency) =>
  CURRENCY_CODES.find((c) => c !== than) ?? CURRENCY_CODES[0];

/** Preselects the expiry chip closest to (but not below) the time left; null when there is none. */
function expiryFromDate(expiresAt: number | null): ExpiryHours | null {
  if (expiresAt === null) return null;
  const hoursLeft = (expiresAt - Date.now()) / 3_600_000;
  return EXPIRY_OPTIONS_HOURS.find((h) => h >= hoursLeft) ?? 48;
}

export function initialState(offer?: OfferDetail): OfferFormState {
  if (!offer) {
    return {
      giveCurrency: 'USDT',
      giveAmount: '',
      giveMethods: [],
      getCurrency: 'RUB',
      getMethods: [],
      rate: '',
      negotiable: false,
      expiresInHours: 24,
      note: '',
    };
  }
  return {
    giveCurrency: offer.giveCurrency,
    giveAmount: String(fromMinor(offer.giveAmount)),
    giveMethods: offer.giveMethods,
    getCurrency: offer.getCurrency,
    getMethods: offer.getMethods,
    rate: offer.rate === null ? '' : String(offer.rate),
    negotiable: offer.negotiable,
    expiresInHours: expiryFromDate(offer.expiresAt),
    note: offer.note ?? '',
  };
}

const numberOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

export function toInput(state: OfferFormState): OfferInput | null {
  const giveAmount = numberOrNull(state.giveAmount);
  const rate = numberOrNull(state.rate);
  const result = OfferInput.safeParse({
    ...state,
    giveAmount: giveAmount === null || Number.isNaN(giveAmount) ? 0 : toMinor(giveAmount),
    rate: rate === null || Number.isNaN(rate) ? null : rate,
  });
  return result.success ? result.data : null;
}

export function useOfferForm(offer?: OfferDetail) {
  const [state, setState] = useState<OfferFormState>(() => initialState(offer));
  const patch = (p: Partial<OfferFormState>) => setState((s) => ({ ...s, ...p }));

  const setGiveCurrency = (c: Currency) =>
    setState((s) => ({
      ...s,
      giveCurrency: c,
      giveMethods: [],
      getCurrency: s.getCurrency === c ? otherCurrency(c) : s.getCurrency,
      getMethods: s.getCurrency === c ? [] : s.getMethods,
    }));
  const setGetCurrency = (c: Currency) => patch({ getCurrency: c, getMethods: [] });
  const toggle = (side: 'giveMethods' | 'getMethods', method: string) =>
    setState((s) => ({
      ...s,
      [side]: s[side].includes(method) ? s[side].filter((m) => m !== method) : [...s[side], method],
    }));

  return {
    state,
    patch,
    setGiveCurrency,
    setGetCurrency,
    toggle,
    giveMethodOptions: CURRENCY_METHODS[state.giveCurrency],
    getMethodOptions: CURRENCY_METHODS[state.getCurrency],
    input: toInput(state),
  };
}
