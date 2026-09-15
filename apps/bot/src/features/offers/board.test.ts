import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';

import { harness } from '../../bot/testing.ts';
import { createOffer, getOffer } from './service.ts';

const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };

const offer = (over: Partial<OfferInput> = {}): OfferInput => ({
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 24,
  note: null,
  ...over,
});

test('/board pages through the active offers in one message', async () => {
  const { db, say, tap, calls, sent } = harness();
  createOffer(db, alex, offer()); // older
  createOffer(db, alex, offer({ giveCurrency: 'AED', getCurrency: 'EGP', rate: 8.4 }));

  await say(nour, '/board');
  const first = sent(nour.id).at(-1)!;
  assert.match(first.text!, /Offer 1 of 2/);
  assert.match(first.text!, /Alex gives 200 AED for EGP/, 'newest first');
  assert.deepEqual(
    first.buttons.map((b) => b.text),
    [
      '◀',
      'Take',
      '▶',
      '✓ Anything',
      'USDT',
      'USD',
      'EUR',
      'AED',
      'RUB',
      'EGP',
      'Open InnoExchange',
    ],
  );

  await tap(nour, '▶');
  const second = calls.at(-1)!;
  assert.equal(second.method, 'editMessageText', 'the same message, not a new one');
  assert.equal(second.messageId, first.messageId);
  assert.match(second.text!, /Offer 2 of 2/);
  assert.match(second.text!, /Alex gives 200 USDT for RUB/);

  await tap(nour, '◀');
  assert.match(calls.at(-1)!.text!, /Offer 1 of 2/, 'and back again');
});

test('[Browse offers] on the reply keyboard opens the same board', async () => {
  const { db, say, sent } = harness();
  createOffer(db, alex, offer());

  await say(nour, 'Browse offers');
  assert.match(sent(nour.id).at(-1)!.text!, /Offer 1 of 1/);
});

test('the filter chips narrow the board and tick the one you are on', async () => {
  const { db, say, tap, calls } = harness();
  createOffer(db, alex, offer());
  createOffer(db, alex, offer({ giveCurrency: 'AED', getCurrency: 'EGP', rate: 8.4 }));

  await say(nour, '/board');
  await tap(nour, 'USDT');

  const view = calls.at(-1)!;
  assert.match(view.text!, /Offer 1 of 1/);
  assert.match(view.text!, /Alex gives 200 USDT for RUB/);
  assert.ok(
    view.buttons.some((b) => b.text === '✓ USDT'),
    'the chip you are filtering by is ticked',
  );
  assert.ok(!view.buttons.some((b) => b.text === '◀'), 'nothing to page through in a list of one');

  await tap(nour, 'EUR');
  assert.match(calls.at(-1)!.text!, /No offers yet/, 'an empty filter still offers the chips');
  assert.ok(calls.at(-1)!.buttons.some((b) => b.text === '✓ EUR'));
});

test('[Take] on a board card enters the take wizard', async () => {
  const { db, say, tap, sent } = harness();
  const posted = createOffer(db, alex, offer());

  await say(nour, '/board');
  await tap(nour, 'Take');
  assert.match(sent(nour.id).at(-1)!.text!, /How much USDT do you want\?/);

  await say(nour, '50');
  await tap(nour, 'SBP');
  await tap(nour, 'TRC20');
  await tap(nour, 'Request 50 USDT');
  assert.equal(getOffer(db, posted.id).claims[0]?.amount, toMinor(50));
});

test('your own offer is on the board without a way to take it', async () => {
  const { db, say, sent } = harness();
  createOffer(db, alex, offer());

  await say(alex, '/board');
  assert.deepEqual(
    sent(alex.id)
      .at(-1)!
      .buttons.filter((b) => b.text === 'Take'),
    [],
  );
});
