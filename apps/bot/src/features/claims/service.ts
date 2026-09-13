import { type ClaimInput, type ClaimStatus, type Currency, availability } from '@sarraf/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';

import { type Db, type DbOrTx, schema } from '../../db/index.ts';
import type { TelegramUser } from '../../http/auth.ts';
import { AppError } from '../../lib/app-error.ts';
import { queueChannelSync } from '../offers/channel.ts';
import { type OfferDetail, ensureUser, getOffer } from '../offers/service.ts';

const { users, offers, claims } = schema;
type ClaimRow = typeof claims.$inferSelect;
type OfferRow = typeof offers.$inferSelect;

/** A row of the taker's "Your requests": their claim plus what it takes to render and link it. */
export interface MyClaim {
  id: number;
  offerId: number;
  amount: number;
  method: string;
  status: ClaimStatus;
  takerDone: boolean;
  posterDone: boolean;
  giveCurrency: Currency;
  poster: { id: number; firstName: string; username: string | null };
}

/** Statuses that still hold a place in the queue: a taker may have only one at a time per offer. */
const OPEN: ClaimStatus[] = ['pending', 'confirmed'];

export function createClaim(db: Db, taker: TelegramUser, input: ClaimInput): OfferDetail {
  const offer = db.transaction((tx) => {
    ensureUser(tx, taker);
    const row = tx.select().from(offers).where(eq(offers.id, input.offerId)).get();
    if (!row) throw new AppError(404, 'offer-not-found');
    if (row.posterId === taker.id) throw new AppError(403, 'own-offer');
    if (row.status !== 'active') throw new AppError(409, 'offer-unavailable');
    if (!row.getMethods.includes(input.method)) throw new AppError(400, 'unknown-method');
    if (openClaimOf(tx, row.id, taker.id)) throw new AppError(409, 'already-claimed');
    if (input.amount > remainingOf(tx, row)) throw new AppError(409, 'amount-exceeds-remaining');

    tx.insert(claims)
      .values({
        offerId: row.id,
        takerId: taker.id,
        amount: input.amount,
        method: input.method,
      })
      .run();
    return getOffer(tx, row.id, taker.id);
  });
  queueChannelSync(offer.id); // a pending request shows as "awaiting confirmation" in the channel
  return offer;
}

export type ClaimAction = 'confirm' | 'decline' | 'cancel' | 'release' | 'done';

/** Who may do what, and from which status. `release` and `done` are open to both sides. */
const TRANSITIONS: Record<ClaimAction, { from: ClaimStatus[]; by: 'poster' | 'taker' | 'both' }> = {
  confirm: { from: ['pending'], by: 'poster' },
  decline: { from: ['pending'], by: 'poster' },
  cancel: { from: ['pending'], by: 'taker' },
  release: { from: ['confirmed'], by: 'both' },
  done: { from: ['confirmed'], by: 'both' },
};

export function applyClaimAction(
  db: Db,
  userId: number,
  claimId: number,
  action: ClaimAction,
): OfferDetail {
  const offer = db.transaction((tx) => {
    const claim = tx.select().from(claims).where(eq(claims.id, claimId)).get();
    if (!claim) throw new AppError(404, 'claim-not-found');
    const row = tx.select().from(offers).where(eq(offers.id, claim.offerId)).get()!;
    const role = userId === row.posterId ? 'poster' : userId === claim.takerId ? 'taker' : null;
    const rule = TRANSITIONS[action];
    if (role === null || (rule.by !== 'both' && rule.by !== role)) {
      throw new AppError(403, 'not-your-claim');
    }
    if (!rule.from.includes(claim.status)) throw new AppError(409, 'invalid-transition');

    if (action === 'done') markDone(tx, claim, row, role);
    else {
      // Releasing a reservation means the same thing from either side; only the wording differs.
      const to =
        action === 'release' ? (role === 'poster' ? 'declined' : 'cancelled') : STATUS_FOR[action];
      if (to === 'confirmed' && claim.amount > remainingOf(tx, row)) {
        throw new AppError(409, 'amount-exceeds-remaining');
      }
      tx.update(claims).set({ status: to }).where(eq(claims.id, claimId)).run();
    }
    return getOffer(tx, row.id, userId);
  });
  queueChannelSync(offer.id);
  return offer;
}

export function listClaimsByTaker(db: DbOrTx, takerId: number): MyClaim[] {
  const rows = db
    .select()
    .from(claims)
    .innerJoin(offers, eq(claims.offerId, offers.id))
    .innerJoin(users, eq(offers.posterId, users.id))
    .where(eq(claims.takerId, takerId))
    .orderBy(desc(claims.createdAt))
    .all();
  return rows.map(({ claims: claim, offers: offer, users: poster }) => ({
    id: claim.id,
    offerId: claim.offerId,
    amount: claim.amount,
    method: claim.method,
    status: claim.status,
    takerDone: claim.takerDone,
    posterDone: claim.posterDone,
    giveCurrency: offer.giveCurrency,
    poster: {
      id: poster.id,
      firstName: poster.firstName,
      username: claim.status === 'confirmed' || claim.status === 'done' ? poster.username : null,
    },
  }));
}

// --- internals ---

const STATUS_FOR = { confirm: 'confirmed', decline: 'declined', cancel: 'cancelled' } as const;

/** Two-sided: the claim only counts as done once both parties have said so. */
function markDone(tx: DbOrTx, claim: ClaimRow, offer: OfferRow, role: 'poster' | 'taker') {
  const done = role === 'poster' ? { posterDone: true } : { takerDone: true };
  const both = role === 'poster' ? claim.takerDone : claim.posterDone;
  tx.update(claims)
    .set({ ...done, ...(both ? { status: 'done' as const } : {}) })
    .where(eq(claims.id, claim.id))
    .run();
  if (!both) return;
  const { filled } = availability(offer.giveAmount, claimsIn(tx, offer.id));
  if (filled >= offer.giveAmount) {
    tx.update(offers).set({ status: 'completed' }).where(eq(offers.id, offer.id)).run();
  }
}

const claimsIn = (db: DbOrTx, offerId: number): ClaimRow[] =>
  db.select().from(claims).where(eq(claims.offerId, offerId)).all();

const remainingOf = (db: DbOrTx, offer: OfferRow) =>
  availability(offer.giveAmount, claimsIn(db, offer.id)).remaining;

const openClaimOf = (db: DbOrTx, offerId: number, takerId: number) =>
  db
    .select()
    .from(claims)
    .where(
      and(eq(claims.offerId, offerId), eq(claims.takerId, takerId), inArray(claims.status, OPEN)),
    )
    .get();
