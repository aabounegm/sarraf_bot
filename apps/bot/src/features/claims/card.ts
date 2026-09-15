import { type ClaimStatus, claimCallback, formatAmount } from '@sarraf/shared';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { InlineKeyboard } from 'grammy';

import { type Db, type DbOrTx, schema } from '../../db/index.ts';
import { type Translate, totalText } from '../offers/render.ts';
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

export interface Parties {
  claim: ClaimRow;
  offer: OfferDetail;
  poster: UserRow;
  taker: UserRow;
}

export function parties(db: DbOrTx, claimId: number): Parties | null {
  const claim = db.select().from(claims).where(eq(claims.id, claimId)).get();
  if (!claim) return null;
  const offer = getOffer(db, claim.offerId);
  const poster = db.select().from(users).where(eq(users.id, offer.poster.id)).get();
  const taker = db.select().from(users).where(eq(users.id, claim.takerId)).get();
  return poster && taker ? { claim, offer, poster, taker } : null;
}

/**
 * One claim, seen from one side. The poster's copy is the request DM that is re-rendered on every
 * transition (`claims.posterMessageId`); the taker's is a row of `/mine`. Contact details appear
 * only while the claim is confirmed — the gating has to hold here too, not just in the mini app.
 */
export function claimCard(
  p: Parties,
  role: 'poster' | 'taker',
  t: Translate,
  event?: ClaimEvent,
): { text: string; reply_markup: InlineKeyboard } {
  return role === 'poster' ? posterCard(p, t, event) : takerCard(p, t);
}

function posterCard(p: Parties, t: Translate, event?: ClaimEvent) {
  const name = p.taker.firstName;
  const lines = [
    t('claim-request', {
      name,
      amount: amountOf(p),
      id: p.offer.id,
      total: totalText(p.offer, p.claim.amount, t),
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
      lines.push(t('claim-line-confirmed', { name }), ...contact(p.taker, t));
      if (p.claim.takerDone) lines.push(t('claim-line-waiting-you', { name }));
      if (p.claim.posterDone) lines.push(t('claim-line-waiting-them', { name }));
      buttons.url(t('message-user', { name }), chatLink(p.taker)).row();
      if (!p.claim.posterDone) buttons.text(t('mark-done'), claimCallback('done', p.claim.id));
      buttons.text(t('release-reservation'), claimCallback('release', p.claim.id));
      break;
    case 'done':
      lines.push(t('claim-line-done'));
      break;
    case 'declined':
      lines.push(t(event?.action === 'timeout' ? 'claim-line-timeout' : 'claim-line-declined'));
      break;
    case 'cancelled':
      lines.push(
        t(event?.action === 'release' ? 'claim-line-released' : 'claim-line-cancelled', { name }),
      );
      break;
  }
  return { text: lines.join('\n'), reply_markup: buttons };
}

function takerCard(p: Parties, t: Translate) {
  const name = p.poster.firstName;
  const lines = [
    t('your-request', {
      amount: amountOf(p),
      total: totalText(p.offer, p.claim.amount, t),
      method: p.claim.method,
    }),
    `#${p.offer.id} · ${name}`,
  ];
  const buttons = new InlineKeyboard();

  switch (p.claim.status) {
    case 'pending':
      lines.push(t('claim-waiting', { name }));
      buttons.text(t('cancel-request'), claimCallback('cancel', p.claim.id));
      break;
    case 'confirmed':
      lines.push(t('claim-yours', { name }), ...contact(p.poster, t));
      if (p.claim.posterDone) lines.push(t('claim-line-waiting-you', { name }));
      if (p.claim.takerDone) lines.push(t('claim-you-marked-done', { name }));
      buttons.url(t('message-user', { name }), chatLink(p.poster)).row();
      if (!p.claim.takerDone) buttons.text(t('mark-done'), claimCallback('done', p.claim.id));
      buttons.text(t('release-reservation'), claimCallback('release', p.claim.id));
      break;
    case 'done':
      lines.push(t('claim-finished'));
      break;
    case 'declined':
      lines.push(t('request-declined'));
      break;
    case 'cancelled':
      lines.push(t('request-cancelled'));
      break;
  }
  return { text: lines.join('\n'), reply_markup: buttons };
}

/**
 * The handle in the text, next to the button that uses it: a link only opens a chat, while an
 * @handle can be copied, searched and read out. Only ever called from a confirmed claim.
 */
const contact = (other: UserRow, t: Translate) =>
  other.username ? [t('contact-handle', { handle: other.username })] : [];

/** Bots may link to a user by id, so a missing @username is not a dead end here. */
export const chatLink = (user: UserRow) =>
  user.username ? `https://t.me/${user.username}` : `tg://user?id=${user.id}`;

export const amountOf = (p: Parties) => `${formatAmount(p.claim.amount)} ${p.offer.giveCurrency}`;

/** Statuses that still need the taker: the "Your requests" half of `/mine` shows these, newest first. */
const OPEN: ClaimStatus[] = ['pending', 'confirmed'];

export const openClaimsOf = (db: Db, takerId: number): number[] =>
  db
    .select({ id: claims.id })
    .from(claims)
    .where(and(eq(claims.takerId, takerId), inArray(claims.status, OPEN)))
    .orderBy(desc(claims.createdAt))
    .all()
    .map((c) => c.id);
