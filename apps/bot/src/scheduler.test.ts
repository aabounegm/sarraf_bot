import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import type { Api } from 'grammy';

import { harness } from './bot/testing.ts';
import { type Db, openDb, schema } from './db/index.ts';
import { flushClaimNotifications, startClaimNotifications } from './features/claims/notify.ts';
import { applyClaimAction, createClaim } from './features/claims/service.ts';
import { flushChannelSync, startChannelSync } from './features/offers/channel.ts';
import { flushOfferNotifications, startOfferNotifications } from './features/offers/notify.ts';
import { applyOfferAction, createOffer, getOffer } from './features/offers/service.ts';
import { runDueWork } from './scheduler.ts';

const HOUR = 3_600_000;
const alex = { id: 1, first_name: 'Alex', username: 'alex' };
const nour = { id: 2, first_name: 'Nour' };
const input: OfferInput = {
  giveCurrency: 'USDT',
  giveAmount: toMinor(200),
  giveMethods: ['TRC20'],
  getCurrency: 'RUB',
  getMethods: ['SBP', 'Tinkoff'],
  rate: 96.5,
  negotiable: false,
  expiresInHours: 6,
  note: null,
};

interface Call {
  method: string;
  to: number | string;
  text?: string;
  buttons: string[];
}

/** Records the channel post and every DM; message ids count up from 100. */
function wire() {
  const calls: Call[] = [];
  let nextId = 100;
  const record = (method: string, to: number | string, text?: string, options?: unknown) => {
    const markup = (options as { reply_markup?: { inline_keyboard?: { text: string }[][] } })
      ?.reply_markup;
    calls.push({
      method,
      to,
      text,
      buttons: (markup?.inline_keyboard ?? []).flat().map((b) => b.text),
    });
    return Promise.resolve({ message_id: nextId++ });
  };
  const api = {
    sendMessage: (to: number | string, text: string, o?: unknown) => record('send', to, text, o),
    editMessageText: (to: number | string, _id: number, text: string, o?: unknown) =>
      record('edit', to, text, o),
    deleteMessage: (to: number | string, id: number) => record('delete', to, `#${id}`),
  } as unknown as Api;

  const db = openDb(':memory:');
  startChannelSync({ api, db, chat: '@innoexchange', botUsername: 'inno_bot' });
  startClaimNotifications({ api, db });
  startOfferNotifications({ api, db });
  return { db, calls };
}

const settle = () =>
  Promise.all([flushChannelSync(), flushClaimNotifications(), flushOfferNotifications()]);

const dms = (calls: Call[], to: number) => calls.filter((c) => c.method === 'send' && c.to === to);
const claimIdOf = (db: Db, offerId: number) => getOffer(db, offerId).claims[0]!.id;

const row = (db: Db, offerId: number) =>
  db.select().from(schema.offers).where(eq(schema.offers.id, offerId)).get()!;

/**
 * `runDueWork` reads the clock the test gives it, but the rows it writes carry the real one — so a
 * test that answers "now" and then jumps 25h forward has to move its own answer along with it.
 */
const answeredAt = (db: Db, offerId: number, when: number) =>
  db
    .update(schema.offers)
    .set({ updatedAt: new Date(when) })
    .where(eq(schema.offers.id, offerId))
    .run();

test('an offer past its expiry expires once, its post goes, the poster can repost', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, input); // 6h
  await settle();
  assert.equal(calls.filter((c) => c.method === 'send' && c.to === '@innoexchange').length, 1);

  runDueWork(db, Date.now() + 5 * HOUR);
  assert.equal(getOffer(db, offer.id).status, 'active', 'not due yet');

  const now = Date.now() + 7 * HOUR;
  runDueWork(db, now);
  runDueWork(db, now + 60_000); // the next tick, on the same state
  await settle();

  assert.equal(getOffer(db, offer.id).status, 'expired');
  assert.equal(calls.filter((c) => c.method === 'delete').length, 1, 'deleted exactly once');
  const told = dms(calls, alex.id);
  assert.equal(told.length, 1, 'told exactly once');
  assert.match(told[0]!.text!, new RegExp(`#${offer.id} has expired`));
  assert.deepEqual(told[0]!.buttons, ['Repost']);

  // [Repost]: the same offer, a fresh expiry, a fresh post — the id was never retired.
  const reposted = applyOfferAction(db, alex.id, offer.id, 'repost');
  await settle();
  assert.equal(reposted.status, 'active');
  assert.ok(reposted.expiresAt! > Date.now() + 23 * HOUR);
  assert.equal(calls.filter((c) => c.method === 'send' && c.to === '@innoexchange').length, 2);
});

test('a pending request nobody answered in 12h is timed out and the taker told', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, { ...input, expiresInHours: 48 });
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(100),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  const claimId = claimIdOf(db, offer.id);
  await settle();

  runDueWork(db, Date.now() + 11 * HOUR);
  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'pending', 'not due yet');

  const now = Date.now() + 13 * HOUR;
  runDueWork(db, now);
  runDueWork(db, now + 60_000);
  await settle();

  assert.equal(getOffer(db, offer.id).claims[0]?.status, 'declined');
  const told = dms(calls, nour.id);
  assert.equal(told.length, 1);
  assert.match(told[0]!.text!, /No answer from Alex/);
  // The poster's request DM stops offering [Confirm] [Decline] and says why.
  const card = calls.filter((c) => c.method === 'edit' && c.to === alex.id).at(-1)!;
  assert.match(card.text!, /No answer — the request expired/);
  assert.deepEqual(card.buttons, []);
  assert.equal(getOffer(db, offer.id).availability.remaining, toMinor(200));
  assert.equal(claimIdOf(db, offer.id), claimId);
});

test('a no-expiry offer is asked once at 48h and paused after 24h of silence', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, { ...input, expiresInHours: null });
  await settle();

  runDueWork(db, Date.now() + 47 * HOUR);
  await settle();
  assert.equal(dms(calls, alex.id).length, 0, 'not due yet');

  const asked = Date.now() + 49 * HOUR;
  runDueWork(db, asked);
  runDueWork(db, asked + HOUR); // a later tick must not ask again
  await settle();
  const ping = dms(calls, alex.id);
  assert.equal(ping.length, 1, 'asked exactly once');
  assert.match(ping[0]!.text!, new RegExp(`Is #${offer.id} still on\\?`));
  assert.deepEqual(ping[0]!.buttons, ['Yes, still on', 'Pause', 'Close']);
  assert.equal(getOffer(db, offer.id).status, 'active', 'still up while we wait');

  runDueWork(db, asked + 23 * HOUR);
  assert.equal(getOffer(db, offer.id).status, 'active', 'the 24h grace is not over');

  runDueWork(db, asked + 25 * HOUR);
  runDueWork(db, asked + 26 * HOUR);
  await settle();
  assert.equal(getOffer(db, offer.id).status, 'paused');
  const paused = dms(calls, alex.id).at(-1)!;
  assert.equal(dms(calls, alex.id).length, 2, 'one ping, one "paused"');
  assert.match(paused.text!, /is paused/);
  assert.deepEqual(paused.buttons, ['Resume']);
  assert.ok(
    calls.some((c) => c.method === 'edit' && c.to === '@innoexchange' && /🔴 Paused/.test(c.text!)),
    'the channel post says Paused',
  );
});

test('answering the check-in restarts the 48h clock instead of pausing', async () => {
  const { db } = wire();
  const offer = createOffer(db, alex, { ...input, expiresInHours: null });

  const asked = Date.now() + 49 * HOUR;
  runDueWork(db, asked);
  applyOfferAction(db, alex.id, offer.id, 'checkin'); // what [Yes, still on] calls
  await settle(); // the channel sync writes to the row too, so age it once everything has landed
  answeredAt(db, offer.id, asked);
  assert.equal(row(db, offer.id).checkInAt, null, 'answered: nothing is pending an answer');

  runDueWork(db, asked + 25 * HOUR);
  assert.equal(row(db, offer.id).status, 'active', 'answered, so the grace never ran out');
  assert.equal(row(db, offer.id).checkInAt, null, 'and 25h is not another 48h');

  runDueWork(db, asked + 49 * HOUR);
  assert.notEqual(row(db, offer.id).checkInAt, null, 'asked again 48h after the answer');
});

test('[Repost] on the expiry DM is a button in the chat, on the same offer', async () => {
  const { db, bot, calls, tap } = harness();
  startChannelSync({ api: bot.api, db, chat: '@innoexchange', botUsername: 'inno_bot' });
  startOfferNotifications({ api: bot.api, db });
  const offer = createOffer(db, alex, input); // 6h
  await flushChannelSync(); // let the post land, or the expiry coalesces with it

  runDueWork(db, Date.now() + 7 * HOUR);
  await Promise.all([flushChannelSync(), flushOfferNotifications()]);
  await tap(alex, 'Repost');
  await flushChannelSync();

  const back = getOffer(db, offer.id);
  assert.equal(back.status, 'active');
  assert.ok(back.expiresAt! > Date.now() + 23 * HOUR, 'a fresh 24h, not the old expiry');
  // The DM it was tapped on becomes the usual offer card, and the channel has the post again.
  const edited = calls
    .filter((c) => c.method === 'editMessageText' && c.chatId === alex.id)
    .at(-1)!;
  assert.match(edited.text!, /Alex gives 200 USDT for RUB/);
  assert.deepEqual(
    edited.buttons.map((b) => b.text),
    ['Edit', 'Pause', 'Close'],
  );
  const posts = calls.filter((c) => c.method === 'sendMessage' && c.chatId !== alex.id);
  assert.equal(posts.length, 2, 'published, deleted on expiry, published again');
});

test('closing an offer notifies the takers of its pending requests', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, { ...input, expiresInHours: 48 });
  createClaim(db, nour, {
    offerId: offer.id,
    amount: toMinor(50),
    method: 'SBP',
    receiveMethod: 'TRC20',
  });
  const pending = claimIdOf(db, offer.id);
  createClaim(
    db,
    { id: 3, first_name: 'Karim' },
    {
      offerId: offer.id,
      amount: toMinor(50),
      method: 'SBP',
      receiveMethod: 'TRC20',
    },
  );
  const confirmed = getOffer(db, offer.id).claims.find((c) => c.id !== pending)!.id;
  applyClaimAction(db, alex.id, confirmed, 'confirm');
  await settle();

  const closed = applyOfferAction(db, alex.id, offer.id, 'close');
  await settle();

  assert.equal(closed.status, 'closed');
  assert.equal(closed.claims.find((c) => c.id === pending)?.status, 'declined');
  assert.equal(closed.claims.find((c) => c.id === confirmed)?.status, 'confirmed', 'survives');
  assert.equal(dms(calls, nour.id).filter((c) => /declined your request/.test(c.text!)).length, 1);
});
