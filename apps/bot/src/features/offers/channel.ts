import { type OfferStatus, miniAppLink } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import { type Api, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import { type Db, schema } from '../../db/index.ts';
import { complains, createQueue, withRetry } from '../../lib/telegram-queue.ts';
import { renderOffer } from './render.ts';
import { type OfferDetail, getOffer } from './service.ts';

const { offers } = schema;

/** One channel, one mixed-language audience: posts are English (decisions log in architecture.md). */
const LOCALE = 'en';
const t = (key: string, vars?: Record<string, string | number>) => i18n.t(LOCALE, key, vars);

/** Statuses whose post is removed rather than edited. */
const GONE: OfferStatus[] = ['closed', 'completed', 'expired'];

/** Channel posts cannot carry web_app buttons, so both are deep links into the mini app. */
function keyboard(o: OfferDetail, botUsername: string) {
  const buttons = new InlineKeyboard();
  // Nothing to take on a paused or fully-claimed offer; the post stays, the button goes.
  if (o.status === 'active' && o.availability.remaining > 0) {
    buttons.url(t('take'), miniAppLink(botUsername, 'take', o.id));
  }
  return buttons.url(t('open-app'), miniAppLink(botUsername, 'offer', o.id));
}

// --- sync ---

interface ChannelDeps {
  api: Api;
  db: Db;
  chat: string;
  botUsername: string;
}

let deps: ChannelDeps | null = null;
const pending = new Set<number>();
const queue = createQueue('channel sync');

/** Wired at boot; until then (tests, one-off scripts) queueing is a no-op. */
export function startChannelSync(channel: ChannelDeps) {
  deps = channel;
}

/**
 * Re-renders the offer's post after the caller's transaction, one Telegram call at a time.
 * Fire-and-forget: a failed post must never fail the mutation that caused it.
 */
export function queueChannelSync(offerId: number) {
  if (!deps || pending.has(offerId)) return; // already queued: one render covers both changes
  pending.add(offerId);
  queue.push(() => {
    pending.delete(offerId);
    return syncOne(offerId);
  });
}

export const flushChannelSync = () => queue.idle();

async function syncOne(offerId: number) {
  const { api, db, chat, botUsername } = deps!;
  const offer = getOffer(db, offerId);
  const messageId = db
    .select({ id: offers.channelMessageId })
    .from(offers)
    .where(eq(offers.id, offerId))
    .get()!.id;

  if (GONE.includes(offer.status)) {
    if (messageId === null) return;
    try {
      await withRetry(() => api.deleteMessage(chat, messageId));
    } catch (err) {
      if (!complains(err, 'message to delete not found')) throw err;
    }
    setMessageId(db, offerId, null);
    return;
  }

  const text = renderOffer(offer, t);
  const options = {
    parse_mode: 'HTML' as const,
    reply_markup: keyboard(offer, botUsername),
    link_preview_options: { is_disabled: true },
  };

  if (messageId !== null) {
    try {
      await withRetry(() => api.editMessageText(chat, messageId, text, options));
      return;
    } catch (err) {
      if (complains(err, 'message is not modified')) return;
      if (!complains(err, 'message to edit not found', "message can't be edited")) throw err;
      setMessageId(db, offerId, null); // removed in the channel: publish a fresh post below
    }
  }

  const sent = await withRetry(() => api.sendMessage(chat, text, options));
  setMessageId(db, offerId, sent.message_id);
}

const setMessageId = (db: Db, offerId: number, channelMessageId: number | null) =>
  db.update(offers).set({ channelMessageId }).where(eq(offers.id, offerId)).run();
