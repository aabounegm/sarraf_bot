import type { InferResponseType } from 'hono/client';

import type { api } from '../../shared/api/client.ts';
import type { OfferDetail } from '../offer/model.ts';

/** A row of "Your requests": the viewer's own claim, with the offer it belongs to. */
export type MyClaim = InferResponseType<typeof api.claims.mine.$get, 200>[number];

/** A claim as seen on an offer (the poster sees every one, a taker sees their own). */
export type Claim = OfferDetail['claims'][number];

export type ClaimAction = 'confirm' | 'decline' | 'cancel' | 'release' | 'done';

/** Open claims are the ones still worth showing an action for. */
export const isOpen = (c: { status: Claim['status'] }) =>
  c.status === 'pending' || c.status === 'confirmed';

/** Declined and cancelled claims are noise on an offer; everything else is part of its story. */
export const isLive = (c: { status: Claim['status'] }) =>
  c.status !== 'declined' && c.status !== 'cancelled';
