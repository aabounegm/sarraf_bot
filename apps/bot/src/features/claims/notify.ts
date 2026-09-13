import { claimCallback, convert, formatAmount } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import { type Api, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import { type Db, schema } from '../../db/index.ts';
import { complains, createQueue, withRetry } from '../../lib/telegram-queue.ts';
import { type OfferDetail, getOffer } from '../offers/service.ts';
import type { ClaimAction } from './service.ts';

const { users, claims } = schema;
type ClaimRow = typeof claims.$inferSelect;
type UserRow = typeof users.$inferSelect;

/** What just happened to a claim, and which side did it. */
export interface ClaimEvent {
  action: ClaimAction | 'requested';
  by: 'poster' | 'taker';
}

interface Parties {
  claim: ClaimRow;
  offer: OfferDetail;
  poster: UserRow;
  taker: UserRow;
}

interface NotifyDeps {
  api: Api;
  db: Db;
}

let deps: NotifyDeps | null = null;
const queue = createQueue('claim notification');

/** Wired at boot; until then (tests that only exercise the rules, scripts) notifying is a no-op. */
export function startClaimNotifications(d: NotifyDeps) {
  deps = d;
}

/** Fire-and-forget, like the channel post: a DM must never fail the handshake it reports on. */
export function notifyClaim(claimId: number, event: ClaimEvent) {
  if (!deps) return;
  queue.push(() => deliver(claimId, event));
}

export const flushClaimNotifications = () => queue.idle();

async function deliver(claimId: number, event: ClaimEvent) {
  const p = parties(deps!.db, claimId);
  if (!p) return;
  await syncPosterCard(p, event);
  await notifyOtherSide(p, event);
}

// --- the poster's card: one message per claim, re-rendered wherever the change came from ---

/**
 * The request DM the poster received, brought up to date. Whether the poster answered in the bot
 * or in the mini app, this is the message that must stop offering [Confirm] [Decline].
 */
async function syncPosterCard(p: Parties, event: ClaimEvent) {
  const { api, db } = deps!;
  const { text, reply_markup } = posterCard(p, event);
  const messageId = p.claim.posterMessageId;
  if (messageId === null) {
    const sent = await withRetry(() =>
      api.sendMessage(p.poster.id, text, {
        reply_markup,
        link_preview_options: { is_disabled: true },
      }),
    );
    db.update(claims)
      .set({ posterMessageId: sent.message_id })
      .where(eq(claims.id, p.claim.id))
      .run();
    return;
  }
  try {
    await withRetry(() => api.editMessageText(p.poster.id, messageId, text, { reply_markup }));
  } catch (err) {
    // Nothing changed, or the poster deleted it: neither is worth a second message.
    if (!complains(err, 'message is not modified', 'message to edit not found')) throw err;
  }
}

function posterCard(p: Parties, event: ClaimEvent) {
  const t = translator(p.poster.locale);
  const name = p.taker.firstName;
  const lines = [
    t('claim-request', {
      name,
      amount: amountText(p),
      id: p.offer.id,
      total: totalText(p, p.poster.locale),
      method: p.claim.method,
    }),
  ];
  const buttons = new InlineKeyboard();

  switch (p.claim.status) {
    case 'pending':
      buttons
        .text(t('confirm'), claimCallback('confirm', p.claim.id))
        .text(t('decline'), claimCallback('decline', p.claim.id));
      break;
    case 'confirmed':
      lines.push(t('claim-line-confirmed', { name }));
      if (p.claim.takerDone) lines.push(t('claim-line-waiting-you', { name }));
      if (p.claim.posterDone) lines.push(t('claim-line-waiting-them', { name }));
      buttons.url(t('message-user', { name }), chatLink(p.taker)).row();
      if (!p.claim.posterDone) {
        buttons.text(t('mark-done'), claimCallback('done', p.claim.id));
      }
      buttons.text(t('release-reservation'), claimCallback('release', p.claim.id));
      break;
    case 'done':
      lines.push(t('claim-line-done'));
      break;
    case 'declined':
      lines.push(t('claim-line-declined'));
      break;
    case 'cancelled':
      lines.push(
        t(event.action === 'release' ? 'claim-line-released' : 'claim-line-cancelled', { name }),
      );
      break;
  }
  return { text: lines.join('\n'), reply_markup: buttons };
}

// --- the other side: one DM per event, editing nothing ---

/**
 * Whoever did not act gets told, because editing the poster's card is silent. On completion both
 * sides get the summary.
 */
async function notifyOtherSide(p: Parties, event: ClaimEvent) {
  const amount = amountText(p);
  if (p.claim.status === 'done') {
    await dm(
      p.taker,
      translator(p.taker.locale)('claim-dm-completed', { amount, name: p.poster.firstName }),
    );
    await dm(
      p.poster,
      translator(p.poster.locale)('claim-dm-completed', { amount, name: p.taker.firstName }),
    );
    return;
  }
  if (event.action === 'requested') return; // the card itself is the notification

  const [to, from] = event.by === 'poster' ? [p.taker, p.poster] : [p.poster, p.taker];
  const t = translator(to.locale);
  const vars = { name: from.firstName, amount };

  switch (event.action) {
    case 'confirm':
      return dm(
        to,
        t('claim-dm-confirmed', vars),
        new InlineKeyboard().url(t('message-user', { name: from.firstName }), chatLink(from)),
      );
    case 'decline':
      return dm(to, t('claim-dm-declined', vars));
    case 'release':
      return dm(to, t('claim-dm-released', vars));
    case 'done':
      return dm(
        to,
        t('claim-dm-done', { ...vars, id: p.offer.id }),
        new InlineKeyboard()
          .text(t('done-too'), claimCallback('done', p.claim.id))
          .text(t('not-yet'), claimCallback('dismiss', p.claim.id)),
      );
    default:
      return; // a withdrawn request: the poster's card already says so
  }
}

/** Someone who blocked the bot still sees everything in the mini app; that is not an error here. */
const dm = (to: UserRow, text: string, reply_markup?: InlineKeyboard) =>
  withRetry(() => deps!.api.sendMessage(to.id, text, { reply_markup })).catch((err: unknown) => {
    if (!complains(err, 'bot was blocked', 'chat not found', 'user is deactivated')) throw err;
  });

// --- internals ---

const translator =
  (locale: string) =>
  (key: string, vars?: Record<string, string | number>): string =>
    i18n.t(locale, key, vars);

/** Bots may link to a user by id, so a missing @username is not a dead end here. */
const chatLink = (user: UserRow) =>
  user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;

const amountText = (p: Parties) => `${formatAmount(p.claim.amount)} ${p.offer.giveCurrency}`;

const totalText = (p: Parties, locale: string) =>
  p.offer.rate === null
    ? i18n.t(locale, 'rate-open')
    : `${formatAmount(convert(p.offer.giveCurrency, p.offer.getCurrency, p.offer.rate, p.claim.amount))} ${p.offer.getCurrency}`;

function parties(db: Db, claimId: number): Parties | null {
  const claim = db.select().from(claims).where(eq(claims.id, claimId)).get();
  if (!claim) return null;
  const offer = getOffer(db, claim.offerId);
  const poster = db.select().from(users).where(eq(users.id, offer.poster.id)).get();
  const taker = db.select().from(users).where(eq(users.id, claim.takerId)).get();
  return poster && taker ? { claim, offer, poster, taker } : null;
}
