import {
  CURRENCY_CODES,
  CURRENCY_METHODS,
  type Currency,
  EXPIRY_OPTIONS_HOURS,
  type ExpiryHours,
  NOTE_MAX_LENGTH,
  OfferInput,
  availability,
  formatAmount,
  isCurrency,
  rateBase,
  toMinor,
} from '@sarraf/shared';

import {
  type Choice,
  type Wizard,
  type WizardContext,
  askText,
  choicesOf,
  choose,
  chooseMany,
  chunk,
} from '../../bot/wizard.ts';
import type { Config } from '../../config.ts';
import type { Db } from '../../db/index.ts';
import { errorCode, errorText } from '../../lib/app-error.ts';
import { expiryText, renderOffer } from './render.ts';
import { type OfferDetail, createOffer, dealsByUser, getOffer, updateOffer } from './service.ts';

export const OFFER_WIZARD = 'offer-wizard';

/** The current answers. The expiry is absolute, so it is shown rather than offered as a "keep". */
interface Prefill extends Omit<OfferInput, 'expiresInHours'> {
  expiresAt: number | null;
}

/**
 * The step-by-step `/new` from spec § B, and the same walk again with the current answers when
 * editing. Validation is `OfferInput.parse` and the write is the same service the mini app calls:
 * nothing here touches the database or the channel post directly.
 */
export function offerWizard(db: Db, config: Config) {
  return async (conversation: Wizard, ctx: WizardContext, offerId?: number) => {
    const user = ctx.from!;
    const prefill =
      offerId === undefined
        ? null
        : await conversation.external(() => prefillOf(db, offerId, user.id));
    if (offerId !== undefined && prefill === null) return void ctx.reply(ctx.t('mine-offer-gone'));

    // The wizard is the same walk either way, so the first question says which one you are on.
    const lead =
      offerId === undefined ? ctx.t('wizard-new') : ctx.t('wizard-editing', { id: offerId });

    for (;;) {
      const input = await collect(conversation, ctx, prefill, lead);
      const deals = await conversation.external(() => dealsByUser(db, [user.id]).get(user.id) ?? 0);
      const preview = renderOffer(
        previewOf(input, user, deals, offerId ?? 0, await conversation.now()),
        ctx.t,
      );
      const action = await choose(
        conversation,
        ctx,
        `${ctx.t('wizard-preview')}\n\n${preview}`,
        [
          [
            {
              label: ctx.t(offerId === undefined ? 'wizard-post' : 'save-changes'),
              value: 'post',
            },
          ],
          [{ label: ctx.t('wizard-restart'), value: 'restart' }],
        ],
        { html: true },
      );
      if (action === 'restart') continue; // [Cancel] never gets here: bot/wizard.ts halts on it

      const result = await conversation.external(() => save(db, input, user, offerId));
      if ('error' in result) return void ctx.reply(errorText(ctx, result.error));
      return void ctx.reply(
        ctx.t(offerId === undefined ? 'wizard-posted' : 'wizard-saved', {
          id: result.id,
          channel: config.OFFERS_CHANNEL,
        }),
      );
    }
  };
}

// --- the questions ---

async function collect(
  c: Wizard,
  ctx: WizardContext,
  prefill: Prefill | null,
  lead: string,
): Promise<OfferInput> {
  const question = `${lead} ${ctx.t('wizard-give-currency')}`;
  const giveCurrency = await currency(c, ctx, question, CURRENCY_CODES, prefill?.giveCurrency);
  const giveAmount = await amount(c, ctx, giveCurrency, prefill);
  const giveMethods = await methods(
    c,
    ctx,
    'wizard-give-methods',
    giveCurrency,
    prefill?.giveMethods,
  );
  const getCurrency = await currency(
    c,
    ctx,
    ctx.t('wizard-get-currency'),
    CURRENCY_CODES.filter((code) => code !== giveCurrency),
    prefill?.getCurrency,
  );
  const getMethods = await methods(c, ctx, 'wizard-get-methods', getCurrency, prefill?.getMethods);
  const rate = await rateOf(c, ctx, giveCurrency, getCurrency, prefill);
  const expiresInHours = await expiry(c, ctx, prefill);
  const note = await noteOf(c, ctx, prefill?.note ?? null);

  return OfferInput.parse({
    giveCurrency,
    giveAmount,
    giveMethods,
    getCurrency,
    getMethods,
    expiresInHours,
    note,
    ...rate,
  });
}

async function currency(
  c: Wizard,
  ctx: WizardContext,
  question: string,
  codes: readonly Currency[],
  current?: Currency,
): Promise<Currency> {
  for (;;) {
    const picked = await choose(c, ctx, question, chunk(choicesOf(codes), 3), { current });
    if (isCurrency(picked)) return picked;
  }
}

async function amount(
  c: Wizard,
  ctx: WizardContext,
  give: Currency,
  prefill: Prefill | null,
): Promise<number> {
  const answer = await askText<number>(
    c,
    ctx,
    ctx.t('wizard-give-amount', { currency: give }),
    (text) => {
      const value = number(text);
      return value !== null && value > 0
        ? { value: toMinor(value) }
        : { error: ctx.t('wizard-bad-amount') };
    },
    keep(
      ctx,
      prefill?.giveCurrency === give ? `${formatAmount(prefill.giveAmount)} ${give}` : null,
    ),
  );
  return answer.kind === 'value' ? answer.value : prefill!.giveAmount;
}

const methods = (
  c: Wizard,
  ctx: WizardContext,
  question: string,
  cur: Currency,
  prefill: readonly string[] | undefined,
) =>
  chooseMany(
    c,
    ctx,
    ctx.t(question, { currency: cur }),
    choicesOf(CURRENCY_METHODS[cur]),
    prefill?.filter((m) => CURRENCY_METHODS[cur].includes(m)) ?? [],
  );

/** Typed rate, then "Fixed / Asking"; or one button for "negotiable, no rate at all". */
async function rateOf(
  c: Wizard,
  ctx: WizardContext,
  give: Currency,
  get: Currency,
  prefill: Prefill | null,
): Promise<{ rate: number | null; negotiable: boolean }> {
  const base = rateBase(give, get);
  const quote = base === give ? get : give;
  const samePair = prefill?.giveCurrency === give && prefill?.getCurrency === get;
  const answer = await askText<number>(
    c,
    ctx,
    ctx.t('wizard-rate', { base, quote }),
    (text) => {
      const value = number(text);
      return value !== null && value > 0 ? { value } : { error: ctx.t('wizard-bad-rate') };
    },
    [
      { label: ctx.t('wizard-no-rate'), value: 'none' },
      ...keep(ctx, samePair && prefill.rate !== null ? String(prefill.rate) : null),
    ],
  );
  if (answer.kind === 'tap') {
    return answer.value === 'none'
      ? { rate: null, negotiable: true }
      : { rate: prefill!.rate, negotiable: prefill!.negotiable };
  }
  const kind = await choose(
    c,
    ctx,
    ctx.t('wizard-rate-kind', { base, quote, rate: formatAmount(answer.value * 100) }),
    [
      [
        { label: ctx.t('wizard-fixed'), value: 'fixed' },
        { label: ctx.t('wizard-asking'), value: 'asking' },
      ],
    ],
    { current: samePair ? (prefill.negotiable ? 'asking' : 'fixed') : undefined },
  );
  return { rate: answer.value, negotiable: kind === 'asking' };
}

async function expiry(
  c: Wizard,
  ctx: WizardContext,
  prefill: Prefill | null,
): Promise<ExpiryHours | null> {
  const now =
    prefill === null
      ? ''
      : `\n${ctx.t('wizard-expiry-now', { when: expiryText(prefill.expiresAt, ctx.t) })}`;
  const picked = await choose(c, ctx, `${ctx.t('wizard-expiry')}${now}`, [
    EXPIRY_OPTIONS_HOURS.map((hours) => ({
      label: ctx.t('hours-short', { hours }),
      value: String(hours),
    })),
    [{ label: ctx.t('expiry-none'), value: 'none' }],
  ]);
  return picked === 'none' ? null : (Number(picked) as ExpiryHours);
}

async function noteOf(
  c: Wizard,
  ctx: WizardContext,
  prefill: string | null,
): Promise<string | null> {
  const answer = await askText<string>(
    c,
    ctx,
    ctx.t('wizard-note', { max: NOTE_MAX_LENGTH }),
    (text) =>
      text.length > NOTE_MAX_LENGTH
        ? { error: ctx.t('wizard-too-long', { count: text.length, max: NOTE_MAX_LENGTH }) }
        : { value: text },
    [{ label: ctx.t('wizard-skip'), value: 'skip' }, ...keep(ctx, prefill)],
  );
  if (answer.kind === 'value') return answer.value;
  return answer.value === 'keep' ? prefill : null;
}

// --- internals ---

/** Only when editing: one tap to leave an answer as it is. */
const keep = (ctx: WizardContext, value: string | null): Choice[] =>
  value === null ? [] : [{ label: ctx.t('wizard-keep', { value }), value: 'keep' }];

/** "96,5" and "1 000" are how people type numbers here. */
function number(text: string): number | null {
  const parsed = Number(text.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function prefillOf(db: Db, offerId: number, userId: number): Prefill | null {
  const offer = getOffer(db, offerId);
  if (offer.poster.id !== userId) return null;
  const {
    giveCurrency,
    giveAmount,
    giveMethods,
    getCurrency,
    getMethods,
    rate,
    negotiable,
    note,
    expiresAt,
  } = offer;
  return {
    giveCurrency,
    giveAmount,
    giveMethods,
    getCurrency,
    getMethods,
    rate,
    negotiable,
    note,
    expiresAt,
  };
}

/** The offer as it would look — rendered by the same function as the channel post. */
function previewOf(
  input: OfferInput,
  user: { id: number; first_name: string },
  deals: number,
  offerId: number,
  now: number,
): OfferDetail {
  const { expiresInHours, ...rest } = input;
  return {
    ...rest,
    id: offerId,
    status: 'active',
    expiresAt: expiresInHours === null ? null : now + expiresInHours * 3_600_000,
    createdAt: now,
    poster: { id: user.id, firstName: user.first_name, username: null, deals },
    availability: availability(input.giveAmount, []),
    claims: [],
  };
}

function save(
  db: Db,
  input: OfferInput,
  user: { id: number; first_name: string; username?: string; language_code?: string },
  offerId: number | undefined,
): { id: number } | { error: string } {
  try {
    const offer =
      offerId === undefined
        ? createOffer(db, user, input)
        : updateOffer(db, user.id, offerId, input);
    return { id: offer.id };
  } catch (err) {
    return { error: errorCode(err) ?? 'internal' };
  }
}
