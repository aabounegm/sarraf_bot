import {
  AlertInput,
  CURRENCY_CODES,
  CURRENCY_METHODS,
  type Currency,
  currencyLabel,
  isCurrency,
} from '@sarraf/shared';

import {
  type Wizard,
  type WizardContext,
  choicesOf,
  choose,
  chooseMany,
  chunk,
} from '../../bot/wizard.ts';
import type { Db } from '../../db/index.ts';
import { errorCode, errorText } from '../../lib/app-error.ts';
import { saveAlert } from './service.ts';

export const ALERT_WIZARD = 'alert-wizard';

/**
 * `[+ Add a pair]`: the pair, then the methods on each side with "Any" as the finishing button —
 * the short walk the mini app's one screen is. The write is the same service the API calls.
 */
export function alertWizard(db: Db) {
  return async (conversation: Wizard, ctx: WizardContext) => {
    const user = ctx.from!;
    const give = await currency(conversation, ctx, ctx.t('alert-give'), CURRENCY_CODES);
    const get = await currency(
      conversation,
      ctx,
      ctx.t('alert-get'),
      CURRENCY_CODES.filter((code) => code !== give),
    );
    const giveMethods = await methods(conversation, ctx, 'alert-give-methods', give);
    const getMethods = await methods(conversation, ctx, 'alert-get-methods', get);

    const input = AlertInput.parse({
      giveCurrency: give,
      getCurrency: get,
      giveMethods,
      getMethods,
    });
    const result = await conversation.external(() => save(db, user, input));
    if ('error' in result) return void ctx.reply(errorText(ctx, result.error));
    await ctx.reply(ctx.t('alert-added', { give, get }));
  };
}

async function currency(
  c: Wizard,
  ctx: WizardContext,
  question: string,
  codes: readonly Currency[],
): Promise<Currency> {
  for (;;) {
    const choices = codes.map((value) => ({ label: currencyLabel(value), value }));
    const picked = await choose(c, ctx, question, chunk(choices, 3));
    if (isCurrency(picked)) return picked;
  }
}

/** Nothing picked is an answer here: it means "any method", which is the common case. */
const methods = (c: Wizard, ctx: WizardContext, question: string, cur: Currency) =>
  chooseMany(
    c,
    ctx,
    ctx.t(question, { currency: cur }),
    choicesOf(CURRENCY_METHODS[cur]),
    [],
    ctx.t('alert-any-method'),
  );

function save(
  db: Db,
  user: { id: number; first_name: string; username?: string; language_code?: string },
  input: AlertInput,
): { id: number } | { error: string } {
  try {
    return { id: saveAlert(db, user, input).id };
  } catch (err) {
    return { error: errorCode(err) ?? 'internal' };
  }
}
