import { type OfferButton, offerCallback } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import { type Api, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import { type Db, schema } from '../../db/index.ts';
import { createQueue, sendDm } from '../../lib/telegram-queue.ts';

const { offers, users } = schema;

/** What the scheduler has done to an offer and now owes its poster a word about. */
export type OfferEvent = 'expired' | 'checkin' | 'autopaused';

/**
 * The button labels are message ids named after the buttons themselves (`pause`, `close`,
 * `repost`, `checkin`), so a DM is a line of text and a list of buttons — nothing else.
 */
const DM: Record<OfferEvent, { text: string; buttons: OfferButton[] }> = {
  expired: { text: 'offer-dm-expired', buttons: ['repost'] },
  checkin: { text: 'offer-dm-checkin', buttons: ['checkin', 'pause', 'close'] },
  autopaused: { text: 'offer-dm-autopaused', buttons: ['resume'] },
};

interface NotifyDeps {
  api: Api;
  db: Db;
}

let deps: NotifyDeps | null = null;
const queue = createQueue('offer notification');

/** Wired at boot; until then (tests that only exercise the rules, scripts) notifying is a no-op. */
export function startOfferNotifications(d: NotifyDeps) {
  deps = d;
}

/** Fire-and-forget, like the channel post: a DM must never fail the job that sent it. */
export function notifyOffer(offerId: number, event: OfferEvent) {
  if (!deps) return;
  queue.push(() => deliver(offerId, event));
}

export const flushOfferNotifications = () => queue.idle();

async function deliver(offerId: number, event: OfferEvent) {
  const { api, db } = deps!;
  const poster = db
    .select({ id: users.id, locale: users.locale })
    .from(offers)
    .innerJoin(users, eq(offers.posterId, users.id))
    .where(eq(offers.id, offerId))
    .get();
  if (!poster) return;

  // No `ctx` out here: the DM is written in the recipient's stored locale.
  const t = (key: string, vars?: Record<string, string | number>) =>
    i18n.t(poster.locale, key, vars);
  const { text, buttons } = DM[event];
  const keyboard = new InlineKeyboard();
  for (const button of buttons) keyboard.text(t(button), offerCallback(button, offerId));
  await sendDm(api, poster.id, t(text, { id: offerId }), keyboard);
}
