import {
  ALERT_CALLBACK,
  ALERT_NEW_CALLBACK,
  alertCallback,
  parseAlertCallback,
} from '@sarraf/shared';
import { Composer, InlineKeyboard } from 'grammy';

import type { BotContext } from '../../bot/index.ts';
import { ALERTS_COMMAND } from '../../bot/menu.ts';
import { enterWizard } from '../../bot/wizard.ts';
import type { Db } from '../../db/index.ts';
import { errorText } from '../../lib/app-error.ts';
import { esc } from '../offers/render.ts';
import { type Alert, applyAlertAction, listAlerts } from './service.ts';
import { ALERT_WIZARD } from './wizard.ts';

/**
 * `/alerts`: the pairs you are watching, one card each with its own buttons, and `[+ Add a pair]`
 * which is the wizard. The pause button also rides along on the DM an alert sends, so the way out
 * of a noisy pair is always one tap from the message that was too noisy.
 */
export function alertsBot(db: Db) {
  const alerts = new Composer<BotContext>();

  alerts.command(ALERTS_COMMAND, async (ctx) => {
    const mine = listAlerts(db, ctx.from!.id);
    await ctx.reply(mine.length > 0 ? ctx.t('alert-list') : ctx.t('alert-none'), {
      reply_markup: new InlineKeyboard().text(ctx.t('alert-add'), ALERT_NEW_CALLBACK),
    });
    for (const alert of mine) {
      await ctx.reply(card(ctx, alert), { parse_mode: 'HTML', reply_markup: buttons(ctx, alert) });
    }
  });

  alerts.callbackQuery(ALERT_NEW_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();
    await enterWizard(ctx, ALERT_WIZARD);
  });

  alerts.callbackQuery(ALERT_CALLBACK, async (ctx) => {
    const parsed = parseAlertCallback(ctx.callbackQuery.data);
    if (!parsed) return ctx.answerCallbackQuery();
    const { button, alertId } = parsed;

    try {
      const alert = applyAlertAction(db, ctx.from.id, alertId, button);
      const pair = { give: alert.giveCurrency, get: alert.getCurrency };
      await ctx.answerCallbackQuery(ctx.t(`alert-${button}d`, pair));
      await ctx
        .editMessageReplyMarkup({
          reply_markup: button === 'delete' ? undefined : refreshed(ctx, alert),
        })
        .catch(() => undefined);
    } catch (err) {
      await ctx.answerCallbackQuery(errorText(ctx, err));
      await ctx.editMessageReplyMarkup().catch(() => undefined);
    }
  });

  return alerts;
}

/** The pair, and the methods under it when the alert narrows them. */
function card(ctx: BotContext, alert: Alert): string {
  const methods = (currency: string, list: string[]) =>
    list.length === 0 ? null : ctx.t('channel-methods', { currency, methods: list.join(', ') });
  const title = esc(ctx.t('alert-pair', { give: alert.giveCurrency, get: alert.getCurrency }));
  const lines = [
    methods(alert.giveCurrency, alert.giveMethods),
    methods(alert.getCurrency, alert.getMethods),
    alert.paused ? ctx.t('status-paused') : null,
  ].filter((line): line is string => line !== null);
  return [`<b>${title}</b>`, ...lines.map(esc)].join('\n');
}

const buttons = (ctx: BotContext, alert: Alert) =>
  new InlineKeyboard()
    .text(
      ctx.t(alert.paused ? 'resume' : 'pause'),
      alertCallback(alert.paused ? 'resume' : 'pause', alert.id),
    )
    .text(ctx.t('delete'), alertCallback('delete', alert.id));

/**
 * The tapped message's own buttons again, with the alert's row up to date. Anything that is not an
 * alert button stays: on an alert's DM that is the `[Take]` for the offer that just arrived, and
 * pausing the pair is no reason to take it away.
 */
function refreshed(ctx: BotContext, alert: Alert): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const rows = ctx.callbackQuery?.message?.reply_markup?.inline_keyboard ?? [];
  for (const b of rows.flat()) {
    if ('callback_data' in b && !ALERT_CALLBACK.test(b.callback_data))
      keyboard.text(b.text, b.callback_data);
  }
  for (const b of buttons(ctx, alert).inline_keyboard.flat()) keyboard.add(b);
  return keyboard;
}
