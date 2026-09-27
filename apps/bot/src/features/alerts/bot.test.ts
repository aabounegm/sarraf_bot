import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, currencyLabel, toMinor } from '@sarraf/shared';

import { harness } from '../../bot/testing.ts';
import { createOffer } from '../offers/service.ts';
import { flushAlertNotifications, startAlertNotifications } from './notify.ts';
import { listAlerts, saveAlert } from './service.ts';

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

test('the /alerts wizard adds a pair, any method by default', async () => {
  const { db, say, tap, sent } = harness();

  await say(nour, '/alerts');
  assert.match(sent().at(-1)!.text!, /No alerts yet/);

  await tap(nour, '+ Add a pair');
  await tap(nour, currencyLabel('USDT'));
  await tap(nour, currencyLabel('RUB'));
  assert.deepEqual(
    sent()
      .at(-1)!
      .buttons.map((b) => b.text)
      .slice(-2),
    ['Any method', 'Cancel'],
    'finishing with nothing picked is an answer here',
  );

  await tap(nour, 'Any method'); // USDT side
  await tap(nour, 'Any method'); // RUB side
  assert.match(sent().at(-1)!.text!, /I'll message you when someone posts USDT → RUB/);
  assert.deepEqual(listAlerts(db, nour.id), [
    {
      id: 1,
      giveCurrency: 'USDT',
      getCurrency: 'RUB',
      giveMethods: [],
      getMethods: [],
      paused: false,
    },
  ]);

  await say(nour, '/alerts');
  const card = sent(nour.id).at(-1)!;
  assert.match(card.text!, /USDT → RUB/);
  assert.deepEqual(
    card.buttons.map((b) => b.text),
    ['Pause', 'Delete'],
  );
});

test('a matching offer arrives as a DM with [Take] and a way to stop it', async () => {
  const { db, bot, tap, sent, calls } = harness();
  startAlertNotifications({ api: bot.api, db });
  saveAlert(db, nour, {
    giveCurrency: 'USDT',
    getCurrency: 'RUB',
    giveMethods: [],
    getMethods: ['SBP'],
  });

  createOffer(db, alex, input);
  await flushAlertNotifications();

  const dm = sent(nour.id).at(-1)!;
  assert.match(dm.text!, /New offer on USDT → RUB/);
  assert.match(dm.text!, /Alex gives 200 USDT for RUB/, 'the offer as the channel renders it');
  assert.deepEqual(
    dm.buttons.map((b) => b.text),
    ['Take', 'Pause these alerts'],
  );

  // A pair that nobody watches is silent, and the poster never hears about their own offer.
  const before = sent(nour.id).length;
  createOffer(db, alex, { ...input, getCurrency: 'EUR', getMethods: ['Cash'] });
  createOffer(db, nour, input);
  await flushAlertNotifications();
  assert.equal(sent(nour.id).length, before, 'no DM for an offer nobody asked about');

  await tap(nour, 'Pause these alerts');
  assert.equal(listAlerts(db, nour.id)[0]?.paused, true);
  assert.match(calls.at(-2)?.text ?? '', /Alerts for USDT → RUB paused/);
  assert.deepEqual(
    calls.at(-1)!.buttons.map((b) => b.text),
    ['Take', 'Resume', 'Delete'],
    '[Take] survives: pausing the pair is no reason to drop the offer that came in',
  );

  createOffer(db, alex, input);
  await flushAlertNotifications();
  assert.equal(sent(nour.id).length, before, 'a paused alert says nothing');
});

test('the take wizard starts from an alert DM', async () => {
  const { db, bot, tap, sent } = harness();
  startAlertNotifications({ api: bot.api, db });
  saveAlert(db, nour, {
    giveCurrency: 'USDT',
    getCurrency: 'RUB',
    giveMethods: [],
    getMethods: [],
  });
  createOffer(db, alex, input);
  await flushAlertNotifications();

  await tap(nour, 'Take');
  assert.match(sent(nour.id).at(-1)!.text!, /How much USDT do you want\?/);
});
