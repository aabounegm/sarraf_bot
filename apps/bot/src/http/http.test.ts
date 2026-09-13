import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { UserFromGetMe } from 'grammy/types';

import { createBot } from '../bot/index.ts';
import { loadConfig } from '../config.ts';
import { openDb } from '../db/index.ts';
import { createHttp } from './index.ts';

const env = {
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://app.example.com',
  OFFERS_CHANNEL: '@innoexchange',
};

test('/api/health is public; /api/me requires valid initData', async () => {
  const app = createHttp(loadConfig(env), openDb(':memory:'));
  assert.equal((await app.request('/api/health')).status, 200);
  assert.equal((await app.request('/api/me')).status, 401);
  assert.equal(
    (await app.request('/api/me', { headers: { authorization: 'tma nope' } })).status,
    401,
  );
});

test('dev endpoint issues initData the real verifier accepts, and is absent in production', async () => {
  const app = createHttp(loadConfig(env), openDb(':memory:'));
  const initData = await (await app.request('/api/dev/init-data')).text();
  const res = await app.request('/api/me', { headers: { authorization: `tma ${initData}` } });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { id: number }).id, 1);

  const prod = createHttp(loadConfig({ ...env, NODE_ENV: 'production' }), openDb(':memory:'));
  assert.notEqual((await prod.request('/api/dev/init-data')).status, 200);
});

const update = JSON.stringify({
  update_id: 1,
  message: {
    message_id: 1,
    date: 0,
    chat: { id: 5, type: 'private', first_name: 'Nour' },
    from: { id: 5, is_bot: false, first_name: 'Nour' },
    text: '/start',
    entities: [{ type: 'bot_command', offset: 0, length: 6 }],
  },
});

test('webhook: only mounted in webhook mode, only accepts the derived secret, dispatches updates', async () => {
  const config = loadConfig({ ...env, BOT_MODE: 'webhook' });
  const db = openDb(':memory:');
  const bot = createBot(config, db);
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: 'x',
    username: 'innoexchange_bot',
  } as UserFromGetMe;
  const calls: string[] = [];
  bot.api.config.use((_prev, method) => {
    calls.push(method);
    return Promise.resolve({ ok: true, result: true } as never);
  });
  const app = createHttp(config, db, bot);
  const post = (secret?: string) =>
    app.request('/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
      },
      body: update,
    });
  assert.equal((await post()).status, 401);
  assert.equal((await post('wrong')).status, 401);
  assert.equal((await post(config.webhookSecret)).status, 200);
  assert.deepEqual(calls, ['sendMessage']);

  const polling = createHttp(loadConfig(env), db, createBot(loadConfig(env), db));
  assert.notEqual(
    (await polling.request('/webhook', { method: 'POST', body: update })).status,
    200,
  );
});
