import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { UserFromGetMe } from 'grammy/types';

import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { createBot } from './index.ts';
import { sqliteStorage } from './session.ts';

const config = loadConfig({
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://app.example.com',
  OFFERS_CHANNEL: '@innoexchange',
});

test('/start replies in the user language with the menu keyboard', async () => {
  const bot = createBot(config, openDb(':memory:'));
  bot.botInfo = {
    id: 123,
    is_bot: true,
    first_name: 'InnoExchange',
    username: 'innoexchange_bot',
  } as UserFromGetMe;
  const calls: { method: string; payload: unknown }[] = [];
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload });
    return Promise.resolve({ ok: true, result: true } as never);
  });

  await bot.handleUpdate({
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 42, type: 'private', first_name: 'Nour' },
      from: { id: 42, is_bot: false, first_name: 'Nour', language_code: 'ru' },
      text: '/start',
      entities: [{ type: 'bot_command', offset: 0, length: 6 }],
    },
  });

  assert.equal(calls[0]?.method, 'sendMessage');
  const payload = calls[0]?.payload as {
    text: string;
    reply_markup: { keyboard: { text: string; web_app?: { url: string } }[][] };
  };
  assert.match(payload.text, /Привет, Nour\. InnoExchange \(@innoexchange_bot\)/);
  assert.deepEqual(
    payload.reply_markup.keyboard.flat().map((b) => b.text),
    [
      'Смотреть предложения',
      'Новое предложение',
      'Мои предложения',
      'Помощь',
      'Открыть InnoExchange',
    ],
  );
  assert.equal(
    payload.reply_markup.keyboard.at(-1)?.[0]?.web_app?.url,
    config.PUBLIC_URL,
    'the last button is the only one that leaves the chat',
  );
});

test('sqlite session storage round-trips', async () => {
  const storage = sqliteStorage<{ n: number }>(openDb(':memory:'));
  assert.equal(await storage.read('k'), undefined);
  await storage.write('k', { n: 1 });
  await storage.write('k', { n: 2 });
  assert.deepEqual(await storage.read('k'), { n: 2 });
  await storage.delete('k');
  assert.equal(await storage.read('k'), undefined);
});
