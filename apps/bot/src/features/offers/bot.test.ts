import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';

import { harness } from '../../bot/testing.ts';
import { flushClaimNotifications, startClaimNotifications } from '../claims/notify.ts';
import { createClaim } from '../claims/service.ts';
import { createOffer, getOffer, listOffersByPoster } from './service.ts';

const alex = { id: 1, first_name: 'Alex', username: 'alex' };
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

test('the /new wizard walks the spec steps and posts a valid offer', async () => {
  const { db, calls, say, tap, sent } = harness();

  await say(alex, '/new');
  assert.match(sent().at(-1)!.text!, /New offer\. What do you give\?/);

  await tap(alex, 'USDT');
  assert.match(sent().at(-1)!.text!, /How much USDT\?/);

  await say(alex, '200');
  assert.deepEqual(
    sent()
      .at(-1)!
      .buttons.map((b) => b.text),
    ['ByBit', 'Binance', 'TRC20', 'TON', 'BEP20', 'ERC20', 'Pick at least one', 'Cancel'],
    'multi-select with a footer that refuses to finish empty, and a way out',
  );

  await tap(alex, 'TRC20');
  assert.equal(
    calls.at(-1)?.method,
    'editMessageReplyMarkup',
    'toggles by editing its own message',
  );
  assert.deepEqual(
    calls.at(-1)!.buttons.map((b) => b.text),
    ['ByBit', 'Binance', '✓ TRC20', 'TON', 'BEP20', 'ERC20', 'Done (1)', 'Cancel'],
  );

  await tap(alex, 'Done (1)');
  await tap(alex, 'RUB');
  await tap(alex, 'SBP');
  await tap(alex, 'Done (1)');
  assert.match(sent().at(-1)!.text!, /1 USDT = … RUB/, 'the rate is asked in the right direction');

  await say(alex, '96.5');
  await tap(alex, 'Fixed');
  await tap(alex, '24h');
  await tap(alex, 'Skip');

  const preview = sent().at(-1)!;
  assert.match(preview.text!, /Alex gives 200 USDT for RUB/);
  assert.match(preview.text!, /1 USDT = 96\.5 RUB ≈ 19,300 RUB/);
  assert.deepEqual(
    preview.buttons.map((b) => b.text),
    ['Post to channel', 'Start over', 'Cancel'],
  );

  await tap(alex, 'Post to channel');
  const [offer] = listOffersByPoster(db, alex.id);
  assert.ok(offer, 'the offer is in the database');
  assert.deepEqual(
    {
      giveCurrency: offer.giveCurrency,
      giveAmount: offer.giveAmount,
      giveMethods: offer.giveMethods,
      getCurrency: offer.getCurrency,
      getMethods: offer.getMethods,
      rate: offer.rate,
      negotiable: offer.negotiable,
      note: offer.note,
    },
    {
      giveCurrency: 'USDT',
      giveAmount: toMinor(200),
      giveMethods: ['TRC20'],
      getCurrency: 'RUB',
      getMethods: ['SBP'],
      rate: 96.5,
      negotiable: false,
      note: null,
    },
    'exactly what the mini app would have sent as OfferInput',
  );
  assert.ok(offer.expiresAt! > Date.now(), 'expiry counts from now');
  assert.match(sent().at(-1)!.text!, /Posted\. #\d+ is live in @innoexchange/);
});

test('the wizard hands a command back instead of eating it', async () => {
  const { db, say, tap, sent } = harness();

  await say(alex, '/new');
  await tap(alex, 'USDT');
  await say(alex, '/mine');

  assert.match(
    sent().at(-1)!.text!,
    /haven't posted anything yet/,
    '/mine ran, the wizard stopped',
  );
  await say(alex, '200');
  assert.equal(listOffersByPoster(db, alex.id).length, 0, 'no wizard is listening any more');
});

test('/mine shows a card per offer and its buttons act on that offer', async () => {
  const { db, say, tap, sent, calls } = harness();
  const first = createOffer(db, alex, input);
  const second = createOffer(db, alex, { ...input, giveCurrency: 'EUR', giveMethods: ['Cash'] });

  await say(alex, '/mine');
  const cards = sent().filter((c) => c.text?.includes('Alex gives'));
  assert.equal(cards.length, 2);
  assert.deepEqual(
    cards[0]!.buttons.map((b) => b.text),
    ['Edit', 'Pause', 'Close'],
  );

  await tap(alex, 'Pause', new RegExp(`#${second.id} `));
  assert.equal(getOffer(db, second.id).status, 'paused');
  assert.equal(getOffer(db, first.id).status, 'active', 'the other offer is untouched');
  assert.deepEqual(
    calls.at(-1)!.buttons.map((b) => b.text),
    ['Edit', 'Resume', 'Close'],
    'the card is re-rendered in place',
  );

  await tap(alex, 'Close', new RegExp(`#${second.id} `));
  assert.equal(getOffer(db, second.id).status, 'paused', 'the first tap only asks');
  const toast = calls.filter((c) => c.method === 'answerCallbackQuery').at(-1);
  assert.match(toast?.text ?? '', /Close this offer\?/);

  await tap(alex, 'Close'); // the confirmation row that just replaced the card's buttons
  assert.equal(getOffer(db, second.id).status, 'closed');
  assert.equal(getOffer(db, first.id).status, 'active');
});

test('/mine lists the requests you made, and their buttons act on the claim', async () => {
  const { db, say, tap, sent } = harness();
  const nour = { id: 2, first_name: 'Nour' };
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });

  await say(nour, '/mine');
  const card = sent(nour.id).at(-1)!;
  assert.match(card.text!, /Your request: 50 USDT to TRC20 · 4,825 RUB via SBP/);
  assert.match(card.text!, /Waiting for Alex to confirm/);
  assert.deepEqual(
    card.buttons.map((b) => b.text),
    ['Cancel request'],
  );
  assert.ok(!card.text!.includes('@alex'), 'no handle before the poster confirms');

  await tap(nour, 'Cancel request');
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'cancelled');
});

test('[Edit] walks the same questions with the current answers one tap away', async () => {
  const { db, say, tap, sent } = harness();
  const offer = createOffer(db, alex, input);

  await say(alex, '/mine');
  await tap(alex, 'Edit');
  assert.match(
    sent().at(-1)!.text!,
    new RegExp(`Editing #${offer.id}\\. What do you give\\?`),
    'the wizard says which offer it is on, not "New offer"',
  );

  assert.ok(
    sent()
      .at(-1)!
      .buttons.some((b) => b.text === '✓ USDT'),
    'the answer already on the offer is ticked',
  );

  await tap(alex, '✓ USDT');
  assert.deepEqual(
    sent()
      .at(-1)!
      .buttons.map((b) => b.text),
    ['Keep 200 USDT', 'Cancel'],
    'the typed steps offer what is already there',
  );

  await say(alex, '300');
  await tap(alex, 'Done (1)'); // TRC20 is already ticked
  await tap(alex, '✓ RUB');
  await tap(alex, 'Done (1)');
  await tap(alex, 'Keep 96.5');
  await tap(alex, '6h');
  await tap(alex, 'Skip');
  await tap(alex, 'Save changes');

  const saved = getOffer(db, offer.id);
  assert.equal(saved.giveAmount, toMinor(300));
  assert.deepEqual(saved.giveMethods, ['TRC20']);
  assert.equal(saved.rate, 96.5);
  assert.match(sent().at(-1)!.text!, new RegExp(`Saved\\. #${offer.id} is up to date`));
  assert.equal(listOffersByPoster(db, alex.id).length, 1, 'edited, not posted twice');
});

test('a claim button still works while a wizard is waiting for an answer', async () => {
  const { db, bot, say, tap, sent } = harness();
  const nour = { id: 2, first_name: 'Nour' };
  const offer = createOffer(db, alex, input);
  startClaimNotifications({ api: bot.api, db });
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  await flushClaimNotifications();

  await say(alex, '/new');
  await tap(alex, 'Confirm'); // the request DM, arrived mid-wizard
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'confirmed');

  await tap(alex, 'USDT'); // the wizard is still where it was
  assert.match(sent().at(-1)!.text!, /How much USDT\?/);
});

test("an offer card button on someone else's offer says so and shows nothing", async () => {
  const { db, say, tap, calls } = harness();
  const nour = { id: 2, first_name: 'Nour' };
  const offer = createOffer(db, alex, input);
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });

  await say(alex, '/mine');
  await tap(nour, 'Pause'); // the same callback data, a different user
  assert.equal(getOffer(db, offer.id).status, 'active');
  assert.match(calls.at(-2)?.text ?? '', /isn't your offer/);
});

test('changing a currency drops the answers that belonged to the old one', async () => {
  const { db, say, tap, sent } = harness();
  createOffer(db, alex, input);

  await say(alex, '/mine');
  await tap(alex, 'Edit');
  await tap(alex, 'EUR'); // was USDT

  const question = sent().at(-1)!;
  assert.match(question.text!, /How much EUR\?/);
  assert.deepEqual(
    question.buttons.map((b) => b.text),
    ['Cancel'],
    'no "Keep 200 USDT" for an offer that no longer gives USDT',
  );
});

test('every step has a way out, and [Cancel] ends the wizard', async () => {
  const { db, say, tap, sent } = harness();

  await say(alex, '/new');
  await tap(alex, 'Cancel');
  assert.match(sent().at(-1)!.text!, /Cancelled/);

  await say(alex, '200'); // the wizard is gone, so this is just a stray message
  assert.equal(listOffersByPoster(db, alex.id).length, 0);
});
