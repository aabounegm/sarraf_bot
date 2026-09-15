import type { UserFromGetMe } from 'grammy/types';

import { loadConfig } from '../config.ts';
import { type Db, openDb } from '../db/index.ts';
import { createBot } from './index.ts';

/**
 * Used by `*.test.ts` only: a bot whose Telegram calls are recorded instead of sent, plus the two
 * things a test does — say something, tap a button. Updates go through `bot.handleUpdate`, so the
 * middleware, the conversations plugin and i18n all run for real.
 */
export const testConfig = loadConfig({
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://app.example.com',
  OFFERS_CHANNEL: '@innoexchange',
});

export interface Button {
  text: string;
  data?: string;
  url?: string;
}

/** `text` is the message body, or the toast for answerCallbackQuery — Telegram names both `text`. */
export interface Call {
  method: string;
  chatId?: number;
  messageId?: number;
  text?: string;
  buttons: Button[];
}

export interface TestUser {
  id: number;
  first_name: string;
  username?: string;
}

interface RawButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

interface RawPayload {
  chat_id?: number;
  message_id?: number;
  text?: string;
  reply_markup?: { inline_keyboard?: RawButton[][]; keyboard?: RawButton[][] };
}

export function harness(db: Db = openDb(':memory:')) {
  const calls: Call[] = [];
  const refusals: { method: string; description: string }[] = [];
  let nextId = 500;

  /**
   * Recorded at the wire rather than with a transformer on `bot.api`: a conversation builds its
   * own `Api` from the token and the client options, so this is the only seam both sides share.
   */
  const fetch = async (url: string | URL, init?: RequestInit) => {
    const p = JSON.parse(String(init?.body ?? '{}')) as RawPayload;
    const messageId = p.message_id ?? nextId++;
    const method = String(url).split('/').pop()!;
    calls.push({
      method,
      chatId: p.chat_id,
      messageId,
      text: p.text,
      buttons: (p.reply_markup?.inline_keyboard ?? p.reply_markup?.keyboard ?? [])
        .flat()
        .map((b) => ({ text: b.text, data: b.callback_data, url: b.url ?? b.web_app?.url })),
    });
    const headers = { 'content-type': 'application/json' };
    const refused = refusals.findIndex((r) => r.method === method);
    if (refused !== -1) {
      const description = refusals.splice(refused, 1)[0]!.description;
      return new Response(JSON.stringify({ ok: false, error_code: 400, description }), { headers });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        result: { message_id: messageId, date: 0, chat: { id: p.chat_id, type: 'private' } },
      }),
      { headers },
    );
  };

  const bot = createBot(testConfig, db, { fetch: fetch as unknown as typeof globalThis.fetch });
  bot.botInfo = { id: 9, is_bot: true, first_name: 'Inno', username: 'inno_bot' } as UserFromGetMe;

  let updateId = 0;
  let messageId = 0;

  const say = (user: TestUser, text: string) =>
    bot.handleUpdate({
      update_id: ++updateId,
      message: {
        message_id: ++messageId,
        date: 0,
        chat: { id: user.id, type: 'private', first_name: user.first_name },
        from: { is_bot: false, ...user },
        text,
        entities: text.startsWith('/')
          ? [{ type: 'bot_command' as const, offset: 0, length: text.split(' ')[0]!.length }]
          : undefined,
      },
    });

  /** Taps a button by its label, on the most recent message that still offers it. */
  const tap = (user: TestUser, label: string, on?: RegExp) => {
    const call = calls
      .toReversed()
      .find((c) => (on ? on.test(c.text ?? '') : true) && c.buttons.some((b) => b.text === label));
    const data = call?.buttons.find((b) => b.text === label)?.data;
    if (data === undefined) throw new Error(`no button "${label}" in ${JSON.stringify(calls)}`);
    return bot.handleUpdate({
      update_id: ++updateId,
      callback_query: {
        id: `cb${updateId}`,
        chat_instance: 'ci',
        from: { is_bot: false, ...user },
        data,
        message: {
          message_id: call!.messageId!,
          date: 0,
          chat: { id: user.id, type: 'private', first_name: user.first_name },
        },
      },
    });
  };

  const sent = (chatId?: number) =>
    calls.filter(
      (c) => c.method === 'sendMessage' && (chatId === undefined || c.chatId === chatId),
    );

  /** Makes Telegram refuse the next call to `method`, the way it refuses a button it dislikes. */
  const refuseNext = (method: string, description: string) =>
    refusals.push({ method, description });

  return { db, bot, calls, say, tap, sent, refuseNext };
}
