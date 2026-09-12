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
