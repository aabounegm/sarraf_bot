import type { InferResponseType } from 'hono/client';

import type { api } from '../../shared/api/client.ts';

export type OfferSummary = InferResponseType<typeof api.offers.$get, 200>[number];
export type OfferDetail = InferResponseType<(typeof api.offers)[':id']['$get'], 200>;
export type OfferAction = 'pause' | 'resume' | 'close';

/** Shared status colours (the only colours not taken from Telegram's theme). */
export const COLOR_OK = '#2e9e4b';
export const COLOR_WARN = '#d98a00';
