import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';

import { openDb } from '../../db/index.ts';
import { createOffer } from '../offers/service.ts';
import { applyAlertAction, listAlerts, matchingAlerts, saveAlert } from './service.ts';

const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };
const offer: OfferInput = {
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
const anyMethod = { giveMethods: [], getMethods: [] };

/** Who would hear about the offer above. */
const watchers = (db: ReturnType<typeof openDb>) =>
  matchingAlerts(db, { ...offer, posterId: alex.id }).map((w) => w.userId);

test('an alert matches its pair, and only for someone else', () => {
  const db = openDb(':memory:');
  createOffer(db, alex, offer); // the poster exists before anyone can be notified about them
  saveAlert(db, nour, { giveCurrency: 'USDT', getCurrency: 'RUB', ...anyMethod });
  saveAlert(db, alex, { giveCurrency: 'USDT', getCurrency: 'RUB', ...anyMethod });

  assert.deepEqual(watchers(db), [nour.id], 'the poster is not told about their own offer');

  saveAlert(db, nour, { giveCurrency: 'EUR', getCurrency: 'RUB', ...anyMethod });
  assert.equal(listAlerts(db, nour.id).length, 2, 'a second pair is a second alert');
  assert.deepEqual(watchers(db), [nour.id], 'the other pair does not match twice');
});

test('methods narrow an alert; an empty list is "any"', () => {
  const db = openDb(':memory:');
  createOffer(db, alex, offer);

  saveAlert(db, nour, {
    giveCurrency: 'USDT',
    getCurrency: 'RUB',
    giveMethods: ['TON'], // the offer sends TRC20
    getMethods: [],
  });
  assert.deepEqual(watchers(db), [], 'a method the offer does not have excludes it');

  // Same pair, so this edits the alert rather than adding one.
  saveAlert(db, nour, {
    giveCurrency: 'USDT',
    getCurrency: 'RUB',
    giveMethods: ['TON', 'TRC20'],
    getMethods: ['Sber'], // the offer accepts SBP
  });
  assert.equal(listAlerts(db, nour.id).length, 1, 'one alert per pair');
  assert.deepEqual(watchers(db), [], 'both sides have to overlap');

  saveAlert(db, nour, {
    giveCurrency: 'USDT',
    getCurrency: 'RUB',
    giveMethods: ['TON', 'TRC20'],
    getMethods: ['SBP'],
  });
  assert.deepEqual(watchers(db), [nour.id]);
});

test('paused alerts are silent, resumed ones are not, deleted ones are gone', () => {
  const db = openDb(':memory:');
  createOffer(db, alex, offer);
  const alert = saveAlert(db, nour, { giveCurrency: 'USDT', getCurrency: 'RUB', ...anyMethod });

  applyAlertAction(db, nour.id, alert.id, 'pause');
  assert.deepEqual(watchers(db), []);
  assert.equal(listAlerts(db, nour.id)[0]?.paused, true, 'paused, not deleted');

  applyAlertAction(db, nour.id, alert.id, 'resume');
  assert.deepEqual(watchers(db), [nour.id]);

  assert.throws(() => applyAlertAction(db, alex.id, alert.id, 'pause'), /not-your-alert/);
  applyAlertAction(db, nour.id, alert.id, 'delete');
  assert.deepEqual(listAlerts(db, nour.id), []);
  assert.throws(() => applyAlertAction(db, nour.id, alert.id, 'pause'), /alert-not-found/);
});
