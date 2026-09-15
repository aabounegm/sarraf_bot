import type { ClaimStatus, Currency, OfferStatus } from '@sarraf/shared';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Column names are camelCase as written here (Drizzle quotes identifiers, so this is portable).
// Money columns are integer minor units (see @sarraf/shared money.ts). Timestamps are epoch ms.

const timestamps = {
  createdAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer({ mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const users = sqliteTable('users', {
  // Telegram user id: ≤ 52 significant bits, so SQLite's 64-bit INTEGER and a JS number both hold
  // it exactly. On Postgres this must be bigint (pg integer is 32-bit).
  id: integer().primaryKey(),
  username: text(),
  firstName: text().notNull(),
  locale: text().notNull().default('en'),
  ...timestamps,
});

export const offers = sqliteTable('offers', {
  id: integer().primaryKey({ autoIncrement: true }), // shown publicly as #1042
  posterId: integer()
    .notNull()
    .references(() => users.id),
  giveCurrency: text().$type<Currency>().notNull(),
  giveAmount: integer().notNull(),
  giveMethods: text({ mode: 'json' }).$type<string[]>().notNull(),
  getCurrency: text().$type<Currency>().notNull(),
  getMethods: text({ mode: 'json' }).$type<string[]>().notNull(),
  rate: real(), // "1 base = rate quote"; null = open/negotiable with no asking rate
  negotiable: integer({ mode: 'boolean' }).notNull().default(false),
  note: text(),
  expiresAt: integer({ mode: 'timestamp_ms' }), // null = no expiry
  // The 48h check-in on a no-expiry offer: when we asked "is this still on?" and are still
  // waiting. null = not waiting; every poster action clears it, and `updatedAt` is then the
  // "last heard from them" the next ping counts 48h from.
  checkInAt: integer({ mode: 'timestamp_ms' }),
  status: text().$type<OfferStatus>().notNull().default('active'),
  channelMessageId: integer(), // the single channel post kept in sync with this offer
  ...timestamps,
});

export const claims = sqliteTable('claims', {
  id: integer().primaryKey({ autoIncrement: true }),
  offerId: integer()
    .notNull()
    .references(() => offers.id),
  takerId: integer()
    .notNull()
    .references(() => users.id),
  amount: integer().notNull(), // in offer.giveCurrency
  method: text().notNull(), // what the taker pays with: one of offer.getMethods
  receiveMethod: text().notNull().default(''), // what they take it on: one of offer.giveMethods
  status: text().$type<ClaimStatus>().notNull().default('pending'),
  takerDone: integer({ mode: 'boolean' }).notNull().default(false),
  posterDone: integer({ mode: 'boolean' }).notNull().default(false),
  // The poster's request DM, re-rendered on every transition (whichever surface caused it).
  posterMessageId: integer(),
  ...timestamps,
});

/** Key-value store owned by grammY's session plugin (and conversations later). */
export const sessions = sqliteTable('sessions', {
  key: text().primaryKey(),
  value: text().notNull(),
});
