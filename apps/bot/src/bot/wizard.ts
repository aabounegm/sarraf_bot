import type { Conversation } from '@grammyjs/conversations';
import type { I18nFlavor } from '@grammyjs/i18n';
import { type Context, InlineKeyboard } from 'grammy';

import type { BotContext } from './index.ts';
import { CANCEL_COMMAND, isMenuText } from './menu.ts';

/**
 * Inside a conversation only the plugins listed in `conversations({ plugins })` are installed, so
 * the context has i18n but no session and no `ctx.conversation`.
 */
export type WizardContext = Context & I18nFlavor;
export type Wizard = Conversation<BotContext, WizardContext>;

export interface Choice {
  label: string;
  value: string;
}

/**
 * Wizard buttons are answered by whichever wizard is running, so they need no ids: the step that
 * is waiting knows which values it offered. Anything without this prefix belongs to someone else
 * (a claim card, an offer card) and is handed back to the normal middleware.
 */
const PREFIX = 'w:';
const DONE = 'done';
/** Every step carries this, so there is always a visible way out of a wizard. */
const CANCEL = 'cancel';

export type Answer<T> = { kind: 'value'; value: T } | { kind: 'tap'; value: string };

/** Starting a wizard replaces whatever the user was in the middle of; `enter` throws otherwise. */
export async function enterWizard(ctx: BotContext, id: string, ...args: unknown[]) {
  await ctx.conversation.exitAll();
  await ctx.conversation.enter(id, ...args);
}

/**
 * One question, one tap. The answer is edited into the question, so the chat stays readable.
 * `current` ticks the answer that is already on the offer, which is how editing shows what you
 * have without a separate "keep" button: the tick is the keep.
 */
export async function choose(
  conversation: Wizard,
  ctx: WizardContext,
  question: string,
  rows: Choice[][],
  opts: { html?: boolean; current?: string } = {},
): Promise<string> {
  const parse_mode = opts.html ? ('HTML' as const) : undefined;
  const marked = rows.map((row) => row.map((c) => tick(c, c.value === opts.current)));
  const message = await ctx.reply(question, { reply_markup: keyboard(marked, ctx), parse_mode });
  for (;;) {
    const reply = await answer(conversation, ctx);
    if (reply.kind === 'text') {
      await ctx.reply(ctx.t('wizard-use-buttons'));
      continue;
    }
    const choice = rows.flat().find((c) => c.value === reply.value);
    if (!choice) continue; // a button from an earlier step
    await settle(ctx, message, `${question}\n✓ ${choice.label}`, parse_mode);
    return choice.value;
  }
}

/** The multi-select from the spec: buttons toggle "✓ TRC20" by editing their own message. */
export async function chooseMany(
  conversation: Wizard,
  ctx: WizardContext,
  question: string,
  choices: Choice[],
  preset: readonly string[] = [],
): Promise<string[]> {
  const picked = new Set(preset.filter((v) => choices.some((c) => c.value === v)));
  const markup = () =>
    keyboard(
      [
        ...chunk(
          choices.map((c) => tick(c, picked.has(c.value))),
          2,
        ),
        [
          {
            label:
              picked.size === 0
                ? ctx.t('wizard-pick-one')
                : ctx.t('wizard-done-count', { count: picked.size }),
            value: DONE,
          },
        ],
      ],
      ctx,
    );
  const message = await ctx.reply(question, { reply_markup: markup() });
  for (;;) {
    const reply = await answer(conversation, ctx);
    if (reply.kind === 'text') {
      await ctx.reply(ctx.t('wizard-use-buttons'));
      continue;
    }
    if (reply.value === DONE) {
      if (picked.size === 0) continue; // the button says "Pick at least one"
      await settle(ctx, message, `${question}\n✓ ${[...picked].join(', ')}`);
      return [...picked];
    }
    if (!choices.some((c) => c.value === reply.value)) continue;
    if (!picked.delete(reply.value)) picked.add(reply.value);
    await ctx.api
      .editMessageReplyMarkup(message.chat.id, message.message_id, { reply_markup: markup() })
      .catch(() => undefined); // a double tap on the same button changes nothing
  }
}

/**
 * A typed answer, with optional buttons that answer the question instead ("Skip", "Keep 200").
 * `parse` turns the text into the value or into the complaint the user gets back.
 */
export async function askText<T>(
  conversation: Wizard,
  ctx: WizardContext,
  question: string,
  parse: (text: string) => { value: T } | { error: string },
  buttons: Choice[] = [],
): Promise<Answer<T>> {
  const message = await ctx.reply(question, { reply_markup: keyboard([buttons], ctx) });
  for (;;) {
    const reply = await answer(conversation, ctx);
    if (reply.kind === 'tap') {
      const choice = buttons.find((b) => b.value === reply.value);
      if (!choice) continue;
      await settle(ctx, message, `${question}\n✓ ${choice.label}`);
      return { kind: 'tap', value: choice.value };
    }
    const parsed = parse(reply.text);
    if ('error' in parsed) {
      await ctx.reply(parsed.error);
      continue;
    }
    await ctx.api
      .editMessageReplyMarkup(message.chat.id, message.message_id)
      .catch(() => undefined);
    return { kind: 'value', value: parsed.value };
  }
}

// --- internals ---

type Reply = { kind: 'tap'; value: string } | { kind: 'text'; text: string };

/**
 * The one wait every step goes through. A command or a menu button ends the wizard and is handled
 * by the normal middleware; a button that is not ours is handed back the same way; [Cancel] ends
 * it here, so no step has to think about it.
 */
async function answer(conversation: Wizard, ctx: WizardContext): Promise<Reply> {
  const next = await conversation.waitUntil(
    (c) => c.callbackQuery?.data !== undefined || c.message?.text !== undefined,
    { next: true },
  );
  const data = next.callbackQuery?.data;
  if (data !== undefined) {
    if (!data.startsWith(PREFIX)) await conversation.skip({ next: true });
    await next.answerCallbackQuery();
    const value = data.slice(PREFIX.length);
    if (value === CANCEL) {
      await ctx.reply(ctx.t('wizard-cancelled'));
      await conversation.halt();
    }
    return { kind: 'tap', value };
  }
  // Leaving by command or menu button is allowed, but never silent: the half-filled form the user
  // was looking at is gone, and only this says so.
  const text = next.message?.text ?? '';
  if (next.hasCommand(CANCEL_COMMAND)) await conversation.halt({ next: true });
  if (text.startsWith('/') || isMenuText(next, text)) {
    await ctx.reply(ctx.t('wizard-cancelled'));
    await conversation.halt({ next: true });
  }
  return { kind: 'text', text };
}

/** Records the answer in the question's own message and takes the buttons away. */
async function settle(
  ctx: WizardContext,
  message: { chat: { id: number }; message_id: number },
  text: string,
  parse_mode?: 'HTML',
) {
  await ctx.api
    .editMessageText(message.chat.id, message.message_id, text, { parse_mode })
    .catch(() => undefined);
}

const tick = (choice: Choice, on: boolean): Choice =>
  on ? { ...choice, label: `✓ ${choice.label}` } : choice;

function keyboard(rows: Choice[][], ctx: WizardContext): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const row of rows.filter((r) => r.length > 0)) {
    for (const choice of row) kb.text(choice.label, `${PREFIX}${choice.value}`);
    kb.row();
  }
  return kb.text(ctx.t('cancel'), `${PREFIX}${CANCEL}`);
}

export function chunk<T>(items: T[], size: number): T[][] {
  return items.reduce<T[][]>((rows, item, i) => {
    if (i % size === 0) rows.push([]);
    rows.at(-1)!.push(item);
    return rows;
  }, []);
}

export const choicesOf = (values: readonly string[]): Choice[] =>
  values.map((value) => ({ label: value, value }));
