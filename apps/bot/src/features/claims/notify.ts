import { claimCallback } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import { type Api, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import { type Db, schema } from '../../db/index.ts';
import {
  complains,
  createQueue,
  sendDm,
  withRetry,
  withoutUserLinks,
} from '../../lib/telegram-queue.ts';
import { type ClaimEvent, type Parties, amountOf, claimCard, parties } from './card.ts';

const { claims } = schema;
type UserRow = typeof schema.users.$inferSelect;

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
  // Independent on purpose: a card that cannot be edited must not cost the other side the news.
  const [card, told] = await Promise.allSettled([
    syncPosterCard(p, event),
    notifyOtherSide(p, event),
  ]);
  const failed = [card, told].find((r) => r.status === 'rejected');
  if (failed) throw failed.reason; // the queue logs it
}

/**
 * The request DM the poster received, brought up to date. Whether the poster answered in the bot
 * or in the mini app, this is the message that must stop offering [Confirm] [Decline].
 */
async function syncPosterCard(p: Parties, event: ClaimEvent) {
  const { api, db } = deps!;
  const { text, reply_markup } = claimCard(p, 'poster', translator(p.poster.locale), event);
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
    // The taker cannot be linked to: keep the card, lose the shortcut (see `withoutUserLinks`).
    if (complains(err, 'BUTTON_')) {
      await withRetry(() =>
        api.editMessageText(p.poster.id, messageId, text, {
          reply_markup: withoutUserLinks(reply_markup),
        }),
      );
      return;
    }
    // Nothing changed, or the poster deleted it: neither is worth a second message.
    if (!complains(err, 'message is not modified', 'message to edit not found')) throw err;
  }
}

/**
 * Whoever did not act gets told, because editing the poster's card is silent. On completion both
 * sides get the summary.
 */
async function notifyOtherSide(p: Parties, event: ClaimEvent) {
  const amount = amountOf(p);
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
    // The taker's own card, so the news, the handle and [Mark as done] arrive in one message —
    // the poster has had all three on their card since the request landed.
    case 'confirm': {
      const card = claimCard(p, 'taker', t);
      return dm(to, card.text, card.reply_markup);
    }
    case 'decline':
      return dm(to, t('claim-dm-declined', vars));
    case 'timeout':
      return dm(to, t('claim-dm-timeout', vars));
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

const dm = (to: UserRow, text: string, reply_markup?: InlineKeyboard) =>
  sendDm(deps!.api, to.id, text, reply_markup);

const translator =
  (locale: string) =>
  (key: string, vars?: Record<string, string | number>): string =>
    i18n.t(locale, key, vars);
