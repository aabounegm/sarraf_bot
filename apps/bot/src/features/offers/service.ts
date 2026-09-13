import {
  type ClaimStatus,
  type Currency,
  type OfferInput,
  type OfferStatus,
  availability,
} from '@sarraf/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { type Db, type DbOrTx, schema } from '../../db/index.ts';
import type { TelegramUser } from '../../http/auth.ts';
import { AppError } from '../../lib/app-error.ts';
import { queueChannelSync } from './channel.ts';

const { users, offers, claims } = schema;
type OfferRow = typeof offers.$inferSelect;
type UserRow = typeof users.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;

export interface OfferSummary {
  id: number;
  status: OfferStatus;
  giveCurrency: Currency;
  giveAmount: number;
  giveMethods: string[];
  getCurrency: Currency;
  getMethods: string[];
  rate: number | null;
  negotiable: boolean;
  note: string | null;
  expiresAt: number | null;
  createdAt: number;
  poster: { id: number; firstName: string; username: string | null; deals: number };
  availability: ReturnType<typeof availability>;
}

export interface OfferDetail extends OfferSummary {
  claims: {
    id: number;
    taker: { id: number; firstName: string };
    amount: number;
    method: string;
    status: ClaimStatus;
  }[];
}

/** Only takeable offers are on the board; a paused one stays visible to its poster in "My offers". */
const browsable = eq(offers.status, 'active');

export function ensureUser(db: DbOrTx, u: TelegramUser): UserRow {
  const values = { id: u.id, firstName: u.first_name, username: u.username ?? null };
  return db
    .insert(users)
    .values({ ...values, locale: u.language_code ?? 'en' })
    .onConflictDoUpdate({ target: users.id, set: values })
    .returning()
    .get();
}

export function createOffer(db: Db, poster: TelegramUser, input: OfferInput): OfferDetail {
  const offer = db.transaction((tx) => {
    ensureUser(tx, poster);
    const row = tx
      .insert(offers)
      .values({ ...toColumns(input), posterId: poster.id })
      .returning()
      .get();
    return getOffer(tx, row.id);
  });
  queueChannelSync(offer.id);
  return offer;
}

export function updateOffer(
  db: Db,
  userId: number,
  offerId: number,
  input: OfferInput,
): OfferDetail {
  const offer = db.transaction((tx) => {
    const row = ownOffer(tx, userId, offerId);
    if (row.status === 'closed' || row.status === 'completed' || row.status === 'expired') {
      throw new AppError(409, 'offer-finished');
    }
    const { filled, reserved } = availability(row.giveAmount, claimsOf(tx, [offerId]));
    if (input.giveAmount < filled + reserved) throw new AppError(409, 'amount-below-committed');
    tx.update(offers).set(toColumns(input)).where(eq(offers.id, offerId)).run();
    return getOffer(tx, offerId);
  });
  queueChannelSync(offerId);
  return offer;
}

export type OfferAction = 'pause' | 'resume' | 'close';
const TRANSITIONS: Record<OfferAction, { from: OfferStatus[]; to: OfferStatus }> = {
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  close: { from: ['active', 'paused'], to: 'closed' },
};

export function applyOfferAction(
  db: Db,
  userId: number,
  offerId: number,
  action: OfferAction,
): OfferDetail {
  const offer = db.transaction((tx) => {
    const row = ownOffer(tx, userId, offerId);
    const t = TRANSITIONS[action];
    if (!t.from.includes(row.status)) throw new AppError(409, 'invalid-transition');
    tx.update(offers).set({ status: t.to }).where(eq(offers.id, offerId)).run();
    if (action === 'close') {
      // Confirmed reservations survive a close (the deal may still happen); pending requests do not.
      tx.update(claims)
        .set({ status: 'declined' })
        .where(and(eq(claims.offerId, offerId), eq(claims.status, 'pending')))
        .run();
    }
    return getOffer(tx, offerId);
  });
  queueChannelSync(offerId);
  return offer;
}

export function getOffer(db: DbOrTx, offerId: number): OfferDetail {
  const row = db.select().from(offers).where(eq(offers.id, offerId)).get();
  if (!row) throw new AppError(404, 'offer-not-found');
  const offerClaims = claimsOf(db, [offerId]);
  const people = usersById(db, [row.posterId, ...offerClaims.map((c) => c.takerId)]);
  const deals = dealsByUser(db, [row.posterId]);
  return {
    ...toSummary(row, people, deals, offerClaims),
    claims: offerClaims.map((c) => ({
      id: c.id,
      taker: { id: c.takerId, firstName: people.get(c.takerId)?.firstName ?? '' },
      amount: c.amount,
      method: c.method,
      status: c.status,
    })),
  };
}

export function listOffers(db: DbOrTx, filter: { give?: Currency } = {}): OfferSummary[] {
  const where = filter.give ? and(browsable, eq(offers.giveCurrency, filter.give)) : browsable;
  return summarize(db, db.select().from(offers).where(where).orderBy(desc(offers.createdAt)).all());
}

export function listOffersByPoster(db: DbOrTx, posterId: number): OfferSummary[] {
  return summarize(
    db,
    db
      .select()
      .from(offers)
      .where(eq(offers.posterId, posterId))
      .orderBy(desc(offers.createdAt))
      .all(),
  );
}

// --- internals ---

function toColumns(input: OfferInput) {
  const { expiresInHours, ...rest } = input;
  return {
    ...rest,
    negotiable: input.rate === null ? true : input.negotiable,
    expiresAt: expiresInHours === null ? null : new Date(Date.now() + expiresInHours * 3_600_000),
  };
}

function ownOffer(db: DbOrTx, userId: number, offerId: number): OfferRow {
  const row = db.select().from(offers).where(eq(offers.id, offerId)).get();
  if (!row) throw new AppError(404, 'offer-not-found');
  if (row.posterId !== userId) throw new AppError(403, 'not-your-offer');
  return row;
}

function summarize(db: DbOrTx, rows: OfferRow[]): OfferSummary[] {
  if (rows.length === 0) return [];
  const allClaims = claimsOf(
    db,
    rows.map((r) => r.id),
  );
  const posterIds = rows.map((r) => r.posterId);
  const people = usersById(db, posterIds);
  const deals = dealsByUser(db, posterIds);
  return rows.map((row) =>
    toSummary(
      row,
      people,
      deals,
      allClaims.filter((c) => c.offerId === row.id),
    ),
  );
}

function toSummary(
  row: OfferRow,
  people: Map<number, UserRow>,
  deals: Map<number, number>,
  offerClaims: ClaimRow[],
): OfferSummary {
  const poster = people.get(row.posterId);
  return {
    id: row.id,
    status: row.status,
    giveCurrency: row.giveCurrency,
    giveAmount: row.giveAmount,
    giveMethods: row.giveMethods,
    getCurrency: row.getCurrency,
    getMethods: row.getMethods,
    rate: row.rate,
    negotiable: row.negotiable,
    note: row.note,
    expiresAt: row.expiresAt?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    poster: {
      id: row.posterId,
      firstName: poster?.firstName ?? '',
      username: poster?.username ?? null,
      deals: deals.get(row.posterId) ?? 0,
    },
    availability: availability(row.giveAmount, offerClaims),
  };
}

function claimsOf(db: DbOrTx, offerIds: number[]): ClaimRow[] {
  return db.select().from(claims).where(inArray(claims.offerId, offerIds)).all();
}

function usersById(db: DbOrTx, ids: number[]): Map<number, UserRow> {
  const rows = db.select().from(users).where(inArray(users.id, ids)).all();
  return new Map(rows.map((u) => [u.id, u]));
}

/** Reputation: number of `done` claims a user took part in, as poster or as taker. */
export function dealsByUser(db: DbOrTx, userIds: number[]): Map<number, number> {
  const done = eq(claims.status, 'done');
  const asTaker = db
    .select({ userId: claims.takerId, n: count() })
    .from(claims)
    .where(and(done, inArray(claims.takerId, userIds)))
    .groupBy(claims.takerId)
    .all();
  const asPoster = db
    .select({ userId: offers.posterId, n: count() })
    .from(claims)
    .innerJoin(offers, eq(claims.offerId, offers.id))
    .where(and(done, inArray(offers.posterId, userIds)))
    .groupBy(offers.posterId)
    .all();
  const result = new Map<number, number>();
  for (const { userId, n } of [...asTaker, ...asPoster])
    result.set(userId, (result.get(userId) ?? 0) + n);
  return result;
}
