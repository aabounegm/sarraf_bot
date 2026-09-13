import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, claimCallback, toMinor } from '@sarraf/shared';
import type { UserFromGetMe } from 'grammy/types';

import { createBot } from '../../bot/index.ts';
import { loadConfig } from '../../config.ts';
import { type Db, openDb } from '../../db/index.ts';
import { createOffer, getOffer } from '../offers/service.ts';
import { flushClaimNotifications, startClaimNotifications } from './notify.ts';
import { createClaim } from './service.ts';

const config = loadConfig({
  BOT_TOKEN: '123:TEST',
  PUBLIC_URL: 'https://a.b',
  OFFERS_CHANNEL: '@c',
});
const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };
const input: OfferInput = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: null,
};

/** `text` is the message body, or the toast for answerCallbackQuery — Telegram names both `text`. */
interface Call {
  method: string;
  chatId?: number;
  text?: string;
  buttons: string[];
}

/** A bot whose API calls are recorded instead of sent, with the notifier wired to it. */
function harness() {
  const db = openDb(':memory:');
  const bot = createBot(config, db);
  bot.botInfo = { id: 9, is_bot: true, first_name: 'Inno', username: 'inno_bot' } as UserFromGetMe;
  const calls: Call[] = [];
  let nextMessageId = 500;
  bot.api.config.use((_prev, method, payload) => {
    const p = payload as {
      chat_id?: number;
      text?: string;
      reply_markup?: { inline_keyboard: { text: string }[][] };
    };
    calls.push({
      method,
      chatId: p.chat_id,
      text: p.text,
      buttons: (p.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
    });
    return Promise.resolve({
      ok: true,
      result: { message_id: nextMessageId++ },
    } as never);
  });
  startClaimNotifications({ api: bot.api, db });
  return { db, bot, calls };
}

const tap = (
  bot: ReturnType<typeof harness>['bot'],
  user: typeof alex | typeof nour,
  data: string,
) =>
  bot.handleUpdate({
    update_id: 1,
    callback_query: {
      id: 'cb',
      chat_instance: 'ci',
      from: { id: user.id, is_bot: false, first_name: user.first_name },
      data,
      message: {
        message_id: 500,
        date: 0,
        chat: { id: user.id, type: 'private', first_name: user.first_name },
      },
    },
  });

const claimIdOf = (db: Db, offerId: number) => getOffer(db, offerId).claims[0]!.id;

test('a request is a DM to the poster with Confirm/Decline, kept up to date afterwards', async () => {
  const { db, bot, calls } = harness();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, { offerId: offer.id, amount: toMinor(50), method: 'SBP' });
  await flushClaimNotifications();

  const request = calls.find((c) => c.method === 'sendMessage')!;
  assert.equal(request.chatId, alex.id);
  assert.match(
    request.text!,
    /Nour wants to take 50 USDT of your offer #\d+ \(4,825 RUB via SBP\)/,
  );
  assert.deepEqual(request.buttons, ['Confirm', 'Decline']);

  calls.length = 0;
  const claimId = claimIdOf(db, offer.id);
  await tap(bot, alex, claimCallback('confirm', claimId));
  await flushClaimNotifications();

  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'confirmed');
  const edit = calls.find((c) => c.method === 'editMessageText')!;
  assert.match(edit.text!, /Confirmed — reserved for Nour/);
  assert.deepEqual(edit.buttons, ['Message Nour', 'Mark as done', 'Release my reservation']);

  const toTaker = calls.find((c) => c.method === 'sendMessage' && c.chatId === nour.id)!;
  assert.match(toTaker.text!, /Alex confirmed — 50 USDT is yours/);
  assert.deepEqual(toTaker.buttons, ['Message Alex']);
});

test('a button on a claim that moved on says so instead of acting twice', async () => {
  const { db, bot, calls } = harness();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, { offerId: offer.id, amount: toMinor(50), method: 'SBP' });
  const claimId = claimIdOf(db, offer.id);
  await tap(bot, alex, claimCallback('decline', claimId));
  calls.length = 0;

  await tap(bot, alex, claimCallback('confirm', claimId));
  const answer = calls.find((c) => c.method === 'answerCallbackQuery')!;
  assert.equal(answer.text, 'Already closed');
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'declined', 'the decline stands');
});

test('done is two-sided: the other party is asked, then both get the summary', async () => {
  const { db, bot, calls } = harness();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, { offerId: offer.id, amount: toMinor(200), method: 'SBP' });
  const claimId = claimIdOf(db, offer.id);
  await tap(bot, alex, claimCallback('confirm', claimId));
  await flushClaimNotifications();
  calls.length = 0;

  await tap(bot, alex, claimCallback('done', claimId));
  await flushClaimNotifications();
  const prompt = calls.find((c) => c.method === 'sendMessage' && c.chatId === nour.id)!;
  assert.match(prompt.text!, /Alex marked #\d+ \(200 USDT\) as done/);
  assert.deepEqual(prompt.buttons, ['Done on my side too', 'Not yet']);
  calls.length = 0;

  await tap(bot, nour, claimCallback('done', claimId));
  await flushClaimNotifications();
  const claim = getOffer(db, offer.id).claims[0]!;
  assert.equal(claim.status, 'done');
  assert.equal(getOffer(db, offer.id).status, 'completed', 'nothing left to give');
  assert.deepEqual(
    calls.filter((c) => c.method === 'sendMessage').map((c) => c.chatId),
    [nour.id, alex.id],
    'both sides get the summary',
  );
});
