import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, startParam, toMinor } from '@sarraf/shared';

import { harness } from '../../bot/testing.ts';
import { createOffer, getOffer } from '../offers/service.ts';
import { flushClaimNotifications, startClaimNotifications } from './notify.ts';
import { createClaim } from './service.ts';

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

/** The bot, with the notifier wired to it so the claim DMs are sent for real. */
function chat() {
  const h = harness();
  startClaimNotifications({ api: h.bot.api, db: h.db });
  return h;
}

test('a request is a DM to the poster with Confirm/Decline, kept up to date afterwards', async () => {
  const { db, calls, tap, sent } = chat();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();

  const request = sent(alex.id).at(-1)!;
  assert.match(
    request.text!,
    /Nour wants to take 50 USDT of your offer #\d+ \(4,825 RUB via SBP\)/,
  );
  assert.deepEqual(
    request.buttons.map((b) => b.text),
    ['Confirm', 'Decline'],
  );

  const from = calls.length;
  await tap(alex, 'Confirm');
  await flushClaimNotifications();

  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'confirmed');
  const edit = calls.slice(from).find((c) => c.method === 'editMessageText')!;
  assert.match(edit.text!, /Confirmed — reserved for Nour/);
  assert.deepEqual(
    edit.buttons.map((b) => b.text),
    ['Message Nour', 'Mark as done', 'Release my reservation'],
  );

  const toTaker = sent(nour.id).at(-1)!;
  assert.match(toTaker.text!, /Alex confirmed — it's yours/);
  assert.match(toTaker.text!, /Message them at @alex/, 'the handle, now that it is earned');
  assert.deepEqual(
    toTaker.buttons.map((b) => b.text),
    ['Message Alex', 'Mark as done', 'Release my reservation'],
    'the taker can answer from the notification itself',
  );
  assert.equal(toTaker.buttons[0]?.url, 'https://t.me/alex');
});

test('a contact button Telegram refuses costs the button, not the notification', async () => {
  const { db, tap, sent, refuseNext } = chat();
  // No username on either side, so both cards link by id — the link Telegram may refuse.
  const dana = { id: 3, first_name: 'Dana' };
  const offer = createOffer(db, dana, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();

  // What a `tg://user?id=` link to someone whose privacy settings forbid it answers with.
  refuseNext('sendMessage', 'Bad Request: BUTTON_USER_PRIVACY_RESTRICTED');
  await tap(dana, 'Confirm');
  await flushClaimNotifications();

  const toTaker = sent(nour.id).at(-1)!;
  assert.match(toTaker.text!, /Dana confirmed — it's yours/, 'the news still arrived');
  assert.deepEqual(
    toTaker.buttons.map((b) => b.text),
    ['Mark as done', 'Release my reservation'],
    'only the link Telegram refused is gone',
  );
});

test('a poster card that cannot be edited does not cost the taker the news', async () => {
  const { db, tap, sent, refuseNext } = chat();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();

  refuseNext('editMessageText', "Bad Request: message can't be edited");
  await tap(alex, 'Confirm');
  await flushClaimNotifications();

  assert.match(sent(nour.id).at(-1)!.text!, /Alex confirmed — it's yours/);
});

test('a button on a claim that moved on says so instead of acting twice', async () => {
  const { db, calls, tap } = chat();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();
  await tap(alex, 'Decline');
  const from = calls.length;

  await tap(alex, 'Confirm'); // the same message, still showing yesterday's buttons
  const answer = calls.slice(from).find((c) => c.method === 'answerCallbackQuery')!;
  assert.equal(answer.text, 'Already closed');
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'declined', 'the decline stands');
});

test('done is two-sided: the other party is asked, then both get the summary', async () => {
  const { db, calls, tap, sent } = chat();
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(200),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();
  await tap(alex, 'Confirm');
  await flushClaimNotifications();

  await tap(alex, 'Mark as done');
  await flushClaimNotifications();
  const prompt = sent(nour.id).at(-1)!;
  assert.match(prompt.text!, /Alex marked #\d+ \(200 USDT\) as done/);
  assert.deepEqual(
    prompt.buttons.map((b) => b.text),
    ['Done on my side too', 'Not yet'],
  );
  const from = calls.length;

  await tap(nour, 'Done on my side too');
  await flushClaimNotifications();
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'done');
  assert.equal(getOffer(db, offer.id).status, 'completed', 'nothing left to give');
  assert.deepEqual(
    calls
      .slice(from)
      .filter((c) => c.method === 'sendMessage')
      .map((c) => c.chatId),
    [nour.id, alex.id],
    'both sides get the summary',
  );
});

test('the channel Take button, bot half: /start take_<id> runs the take wizard', async () => {
  const { db, say, tap, sent } = chat();
  const offer = createOffer(db, alex, { ...input, giveMethods: ['TRC20', 'TON'] });

  await say(nour, `/start ${startParam('take', offer.id)}`);
  assert.match(sent(nour.id).at(0)!.text!, /Alex gives 200 USDT for RUB/, 'the offer, first');
  assert.ok(!sent(nour.id).some((c) => c.text?.includes('@alex')), 'no handle before confirmation');
  assert.match(sent(nour.id).at(-1)!.text!, /How much USDT do you want\?\nMax 200 USDT/);

  await say(nour, '50');
  assert.deepEqual(
    sent(nour.id)
      .at(-1)!
      .buttons.map((b) => b.text),
    ['SBP', 'Cancel'],
    'only the methods the poster accepts',
  );

  await tap(nour, 'SBP');
  assert.deepEqual(
    sent(nour.id)
      .at(-1)!
      .buttons.map((b) => b.text),
    ['TRC20', 'TON', 'Cancel'],
    'and the methods the offer pays out on',
  );

  await tap(nour, 'TON');
  const preview = sent(nour.id).at(-1)!;
  assert.match(preview.text!, /asking for 50 USDT of #\d+ via TON, paying 4,825 RUB via SBP/);

  await tap(nour, 'Request 50 USDT');
  await flushClaimNotifications();
  const claim = getOffer(db, offer.id).claims[0];
  assert.equal(claim?.amount, toMinor(50));
  assert.equal(claim?.method, 'SBP');
  assert.equal(claim?.receiveMethod, 'TON');
  assert.equal(claim?.status, 'pending');
  assert.match(sent(alex.id).at(-1)!.text!, /Nour wants to take 50 USDT/, 'the poster is asked');
  assert.match(
    sent(alex.id).at(-1)!.text!,
    /Nour wants the USDT via TON/,
    'and told where to send',
  );
});

test('the take wizard refuses an offer that is not takeable', async () => {
  const { db, say, sent } = chat();
  const offer = createOffer(db, alex, input);

  await say(alex, `/start ${startParam('take', offer.id)}`);
  assert.match(sent(alex.id).at(-1)!.text!, /can't take your own offer/);

  await say(nour, `/start ${startParam('take', offer.id + 99)}`);
  assert.match(sent(nour.id).at(-1)!.text!, /doesn't exist/);
});
