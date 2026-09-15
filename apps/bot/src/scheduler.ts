import { and, eq, inArray, isNull, lte } from 'drizzle-orm';

import { type Db, schema } from './db/index.ts';
import { applyClaimAction } from './features/claims/service.ts';
import { notifyOffer } from './features/offers/notify.ts';
import { applyOfferAction } from './features/offers/service.ts';

const { offers, claims } = schema;

const HOUR = 3_600_000;
const TICK_MS = 60_000;

/** Spec § Expiry and § Not covered by the prototype; the decisions log for the 12h. */
const CHECK_IN_EVERY = 48 * HOUR;
const CHECK_IN_GRACE = 24 * HOUR;
const PENDING_MAX_AGE = 12 * HOUR;

/**
 * Everything that has fallen due by `now`, in one pass. A plain function of the database and a
 * clock: the tick calls it with `Date.now()`, tests call it with whatever time they want to be.
 *
 * Every job asks the database what is due and every job's own effect takes the row back out of
 * that question, so a second tick finds nothing and a restart mid-tick resumes exactly where the
 * committed state says it is. Nothing is remembered between ticks.
 */
export function runDueWork(db: Db, now: number) {
  expireOffers(db, now);
  declineStalePending(db, now);
  pauseUnanswered(db, now);
  askStillOn(db, now);
}

/** Wired in main.ts, like the channel queue: importing this module starts nothing. */
export function startScheduler(db: Db) {
  const tick = () => attempt('scheduler tick', () => runDueWork(db, Date.now()));
  tick(); // whatever fell due while the process was down, before waiting a minute for it
  return setInterval(tick, TICK_MS);
}

/** Its expiry has passed: status `expired`, the post is deleted, the poster gets a [Repost]. */
function expireOffers(db: Db, now: number) {
  // Idempotent: `expired` is not in the `from` of this query, nor in the action's transition.
  const due = db
    .select({ id: offers.id, posterId: offers.posterId })
    .from(offers)
    .where(and(inArray(offers.status, ['active', 'paused']), lte(offers.expiresAt, new Date(now))))
    .all();
  for (const offer of due)
    attempt(`expire offer ${offer.id}`, () => {
      // The poster is the actor: the service's rules, the channel sync and the pending takers'
      // notifications are all the ones a close already goes through.
      applyOfferAction(db, offer.posterId, offer.id, 'expire');
      notifyOffer(offer.id, 'expired');
    });
}

/** A request nobody answered in 12h is declined in the poster's name, and the taker told why. */
function declineStalePending(db: Db, now: number) {
  // Idempotent: the claim leaves `pending`, and `applyClaimAction` refuses the repeat anyway.
  const due = db
    .select({ id: claims.id, posterId: offers.posterId })
    .from(claims)
    .innerJoin(offers, eq(claims.offerId, offers.id))
    .where(
      and(eq(claims.status, 'pending'), lte(claims.createdAt, new Date(now - PENDING_MAX_AGE))),
    )
    .all();
  for (const claim of due)
    attempt(`time out claim ${claim.id}`, () =>
      applyClaimAction(db, claim.posterId, claim.id, 'timeout'),
    );
}

/** 24h after the check-in went out with no answer: paused, post and all (spec § Expiry). */
function pauseUnanswered(db: Db, now: number) {
  // Idempotent: pausing clears `checkInAt` and takes the offer out of `active`.
  const due = db
    .select({ id: offers.id, posterId: offers.posterId })
    .from(offers)
    .where(and(eq(offers.status, 'active'), lte(offers.checkInAt, new Date(now - CHECK_IN_GRACE))))
    .all();
  for (const offer of due)
    attempt(`pause unanswered offer ${offer.id}`, () => {
      applyOfferAction(db, offer.posterId, offer.id, 'pause');
      notifyOffer(offer.id, 'autopaused');
    });
}

/** "Is #1042 still on?" — what makes a no-expiry offer acceptable at all. */
function askStillOn(db: Db, now: number) {
  const due = db
    .select({ id: offers.id })
    .from(offers)
    .where(
      and(
        eq(offers.status, 'active'),
        isNull(offers.expiresAt), // an offer with an expiry has one already
        isNull(offers.checkInAt), // not already waiting for an answer
        lte(offers.updatedAt, new Date(now - CHECK_IN_EVERY)),
      ),
    )
    .all();
  for (const offer of due)
    attempt(`check in on offer ${offer.id}`, () => {
      // Marked as asked before the DM is queued, and the mark is what the next tick reads: a lost
      // DM costs one silent auto-pause, where the other order would ask again on every tick.
      db.update(offers)
        .set({ checkInAt: new Date(now) })
        .where(eq(offers.id, offer.id))
        .run();
      notifyOffer(offer.id, 'checkin');
    });
}

/** One stale row must not skip the rest of the tick — and a throw in an interval ends the process. */
function attempt(what: string, job: () => void) {
  try {
    job();
  } catch (err) {
    console.error(`${what} failed`, err);
  }
}
