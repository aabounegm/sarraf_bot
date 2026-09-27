import { type AlertInput, type Currency, matchesAlert } from '@sarraf/shared';
import { and, eq, ne } from 'drizzle-orm';

import { type Db, type DbOrTx, schema } from '../../db/index.ts';
import type { TelegramUser } from '../../http/auth.ts';
import { AppError } from '../../lib/app-error.ts';
import { ensureUser } from '../offers/service.ts';

const { alerts, users } = schema;
type AlertRow = typeof alerts.$inferSelect;

export interface Alert {
  id: number;
  giveCurrency: Currency;
  getCurrency: Currency;
  /** Empty = any method on that side. */
  giveMethods: string[];
  getMethods: string[];
  paused: boolean;
}

const toAlert = (row: AlertRow): Alert => ({
  id: row.id,
  giveCurrency: row.giveCurrency,
  getCurrency: row.getCurrency,
  giveMethods: row.giveMethods,
  getMethods: row.getMethods,
  paused: row.paused,
});

export const listAlerts = (db: DbOrTx, userId: number): Alert[] =>
  db.select().from(alerts).where(eq(alerts.userId, userId)).orderBy(alerts.id).all().map(toAlert);

/** Create, or edit the methods of the alert this user already has on that pair. Resumes it too. */
export function saveAlert(db: Db, user: TelegramUser, input: AlertInput): Alert {
  return db.transaction((tx) => {
    ensureUser(tx, user);
    const values = { ...input, userId: user.id, paused: false };
    return toAlert(
      tx
        .insert(alerts)
        .values(values)
        .onConflictDoUpdate({
          target: [alerts.userId, alerts.giveCurrency, alerts.getCurrency],
          set: { giveMethods: input.giveMethods, getMethods: input.getMethods, paused: false },
        })
        .returning()
        .get(),
    );
  });
}

export type AlertAction = 'pause' | 'resume' | 'delete';

/** Returns the alert as it now is; `delete` returns the row it removed, so the caller can name it. */
export function applyAlertAction(
  db: Db,
  userId: number,
  alertId: number,
  action: AlertAction,
): Alert {
  const row = db.select().from(alerts).where(eq(alerts.id, alertId)).get();
  if (!row) throw new AppError(404, 'alert-not-found');
  if (row.userId !== userId) throw new AppError(403, 'not-your-alert');
  if (action === 'delete') {
    db.delete(alerts).where(eq(alerts.id, alertId)).run();
    return toAlert(row);
  }
  const paused = action === 'pause';
  if (row.paused === paused) throw new AppError(409, 'invalid-transition');
  return toAlert(db.update(alerts).set({ paused }).where(eq(alerts.id, alertId)).returning().get());
}

/**
 * Who asked to hear about an offer like this one: the pair narrows it in SQL, the methods in
 * `matchesAlert` — the same rule both surfaces show. The poster never gets their own offer.
 */
export function matchingAlerts(
  db: DbOrTx,
  offer: {
    posterId: number;
    giveCurrency: Currency;
    getCurrency: Currency;
    giveMethods: string[];
    getMethods: string[];
  },
): { alertId: number; userId: number; locale: string }[] {
  return db
    .select({ alert: alerts, locale: users.locale })
    .from(alerts)
    .innerJoin(users, eq(alerts.userId, users.id))
    .where(
      and(
        eq(alerts.paused, false),
        ne(alerts.userId, offer.posterId),
        eq(alerts.giveCurrency, offer.giveCurrency),
        eq(alerts.getCurrency, offer.getCurrency),
      ),
    )
    .all()
    .filter(({ alert }) => matchesAlert(offer, alert))
    .map(({ alert, locale }) => ({ alertId: alert.id, userId: alert.userId, locale }));
}
