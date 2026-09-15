import type { InferResponseType } from 'hono/client';

import type { api } from '../../shared/api/client.ts';

export type OfferSummary = InferResponseType<typeof api.offers.$get, 200>[number];
export type OfferDetail = InferResponseType<(typeof api.offers)[':id']['$get'], 200>;
/** The poster's own offers come with their claims attached, to render the requests underneath. */
export type MyOffer = InferResponseType<typeof api.offers.mine.$get, 200>[number];
/** Mirrors the API's action enum — the scheduler's `expire`/`checkin` are not on it. */
export type OfferAction = 'pause' | 'resume' | 'close' | 'repost';

/** Shared status colours (the only colours not taken from Telegram's theme). */
export const COLOR_OK = '#2e9e4b';
export const COLOR_WARN = '#d98a00';
