import {
  COMMUNITY_TIMEZONE,
  type OfferStatus,
  convert,
  formatAmount,
  miniAppLink,
  rateInfo,
} from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import { type Api, GrammyError, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import { type Db, schema } from '../../db/index.ts';
import { type OfferDetail, getOffer } from './service.ts';

const { offers } = schema;

/** One channel, one mixed-language audience: posts are English (decisions log in architecture.md). */
const LOCALE = 'en';
const t = (key: string, vars?: Record<string, string | number>) => i18n.t(LOCALE, key, vars);

/** Statuses whose post is removed rather than edited. */
const GONE: OfferStatus[] = ['closed', 'completed', 'expired'];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const amount = (minor: number, currency: string) => `${formatAmount(minor)} ${currency}`;

/** The post body, HTML. Kept in sync with docs/spec.md § Channel. */
export function renderOffer(o: OfferDetail): string {
  const lines = [
    `<b>${esc(
      t('channel-title', {
        name: o.poster.firstName,
        amount: formatAmount(o.giveAmount),
        give: o.giveCurrency,
        get: o.getCurrency,
      }),
    )}</b>`,
    esc(rateLine(o)),
    esc(t('channel-methods', { currency: o.giveCurrency, methods: o.giveMethods.join(', ') })),
    esc(t('channel-methods', { currency: o.getCurrency, methods: o.getMethods.join(', ') })),
  ];
  if (o.note) lines.push(`<i>${esc(o.note)}</i>`);
  lines.push(...statusLines(o).map(esc), esc(footer(o)));
  return lines.join('\n');
}

function rateLine(o: OfferDetail): string {
  const info = rateInfo(o);
  if (info.kind === 'open') return t('rate-open');
  const rate = t(`rate-${info.kind}`, {
    base: info.base,
    quote: info.quote,
    rate: formatAmount(info.rate * 100),
  });
  const total = convert(o.giveCurrency, o.getCurrency, info.rate, o.giveAmount);
  return `${rate} ${t('channel-total', { total: formatAmount(total), currency: o.getCurrency })}`;
}

function statusLines(o: OfferDetail): string[] {
  if (o.status === 'paused') return [`● ${t('status-paused')}`];
  const { remaining, reserved, requested } = o.availability;
  const partial = remaining !== o.giveAmount;
  const left = partial
    ? t('left-of', {
        left: formatAmount(remaining),
        total: amount(o.giveAmount, o.giveCurrency),
      })
    : t('available', { amount: amount(remaining, o.giveCurrency) });
  const contention = [
    reserved > 0 && t('reserved', { amount: amount(reserved, o.giveCurrency) }),
    requested > 0 && t('awaiting-confirmation', { amount: amount(requested, o.giveCurrency) }),
  ].filter((x): x is string => Boolean(x));
  return [
    `● ${t(partial ? 'status-partial' : 'status-active')} — ${left}`,
    ...(contention.length > 0 ? [contention.join(' · ')] : []),
  ];
}

const footer = (o: OfferDetail) =>
  `#${o.id} · ${o.poster.firstName}, ${t('deals', { count: o.poster.deals })} · ${expiry(o.expiresAt)}`;

/** "expires today 20:00" — in the community's timezone, not the reader's. */
function expiry(expiresAt: number | null): string {
  if (expiresAt === null) return t('no-expiry');
  const at = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { timeZone: COMMUNITY_TIMEZONE, ...options });
  const date = at({ year: 'numeric', month: '2-digit', day: '2-digit' });
  const now = Date.now();
  const day =
    date.format(expiresAt) === date.format(now)
      ? t('today')
      : date.format(expiresAt) === date.format(now + 86_400_000)
        ? t('tomorrow')
        : at({ weekday: 'short' }).format(expiresAt);
  return t('expires-at', {
    when: `${day} ${at({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(expiresAt)}`,
  });
}

// Take lands on a screen that does not exist yet; it arrives with the claims feature.
const keyboard = (offerId: number, botUsername: string) =>
  new InlineKeyboard().url(t('open-app'), miniAppLink(botUsername, 'offer', offerId));

// --- sync ---

interface ChannelDeps {
  api: Api;
  db: Db;
  chat: string;
  botUsername: string;
}

let deps: ChannelDeps | null = null;
const pending = new Set<number>();
let queue: Promise<unknown> = Promise.resolve();

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
  queue = queue.then(async () => {
    pending.delete(offerId);
    try {
      await syncOne(offerId);
    } catch (err) {
      console.error(`channel sync failed for offer ${offerId}`, err);
    }
  });
}

/** Resolves when the queue is empty — for tests and for a clean shutdown. */
export const flushChannelSync = () => queue;

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

  const text = renderOffer(offer);
  const options = {
    parse_mode: 'HTML' as const,
    reply_markup: keyboard(offerId, botUsername),
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

const complains = (err: unknown, ...reasons: string[]) =>
  err instanceof GrammyError && reasons.some((reason) => err.description.includes(reason));

/** Telegram answers 429 with the exact pause to take; every other failure is the caller's problem. */
async function withRetry<T>(call: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const retryAfter = err instanceof GrammyError ? err.parameters.retry_after : undefined;
      if (retryAfter === undefined || attempt === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
}
