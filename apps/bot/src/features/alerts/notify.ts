import { alertCallback, takeCallback } from '@sarraf/shared';
import { type Api, InlineKeyboard } from 'grammy';

import { i18n } from '../../bot/i18n.ts';
import type { Db } from '../../db/index.ts';
import { createQueue, sendDm } from '../../lib/telegram-queue.ts';
import { renderOffer } from '../offers/render.ts';
import { getOffer } from '../offers/service.ts';
import { matchingAlerts } from './service.ts';

interface NotifyDeps {
  api: Api;
  db: Db;
}

let deps: NotifyDeps | null = null;
const queue = createQueue('alert notification');

/** Wired at boot; until then (tests that only exercise the rules, scripts) notifying is a no-op. */
export function startAlertNotifications(d: NotifyDeps) {
  deps = d;
}

/**
 * Fire-and-forget, like the channel post: a DM must never fail the offer that caused it. Sent when
 * an offer is posted — that is the moment the channel gets a post, and this is its private twin.
 */
export function notifyMatchingAlerts(offerId: number) {
  if (!deps) return;
  queue.push(() => deliver(offerId));
}

export const flushAlertNotifications = () => queue.idle();

async function deliver(offerId: number) {
  const { api, db } = deps!;
  const offer = getOffer(db, offerId);
  const watchers = matchingAlerts(db, { ...offer, posterId: offer.poster.id });

  for (const { alertId, userId, locale } of watchers) {
    // No `ctx` out here: the DM is written in the recipient's stored locale.
    const t = (key: string, vars?: Record<string, string | number>) => i18n.t(locale, key, vars);
    const keyboard = new InlineKeyboard();
    if (offer.availability.remaining > 0) keyboard.text(t('take'), takeCallback(offer.id));
    keyboard.text(t('alert-pause'), alertCallback('pause', alertId));
    await sendDm(
      api,
      userId,
      `${t('alert-dm-match', { give: offer.giveCurrency, get: offer.getCurrency })}\n\n${renderOffer(offer, t)}`,
      keyboard,
      { parse_mode: 'HTML', link_preview_options: { is_disabled: true } },
    );
  }
}
