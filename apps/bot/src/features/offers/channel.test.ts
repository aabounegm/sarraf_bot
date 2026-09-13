import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type OfferInput, toMinor } from '@sarraf/shared';
import { eq } from 'drizzle-orm';
import type { Api } from 'grammy';

import { type Db, openDb, schema } from '../../db/index.ts';
import { flushChannelSync, renderOffer, startChannelSync } from './channel.ts';
import { applyOfferAction, createOffer, getOffer } from './service.ts';

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
  expiresInHours: 24,
  note: 'Technopark lobby',
};

/** Records what would go to Telegram; message ids count up from 100. */
function stubApi() {
  const calls: { method: string; text?: string; messageId?: number }[] = [];
  let nextId = 100;
  const api = {
    sendMessage: (_chat: string, text: string) => {
      calls.push({ method: 'send', text });
      return Promise.resolve({ message_id: nextId++ });
    },
    editMessageText: (_chat: string, messageId: number, text: string) => {
      calls.push({ method: 'edit', text, messageId });
      return Promise.resolve({ message_id: messageId });
    },
    deleteMessage: (_chat: string, messageId: number) => {
      calls.push({ method: 'delete', messageId });
      return Promise.resolve(true);
    },
  };
  return { calls, api: api as unknown as Api };
}

function wire(): { db: Db; calls: ReturnType<typeof stubApi>['calls'] } {
  const db = openDb(':memory:');
  const { api, calls } = stubApi();
  startChannelSync({ api, db, chat: '@innoexchange', botUsername: 'innoexchange_bot' });
  return { db, calls };
}

const messageId = (db: Db, offerId: number) =>
  db.select().from(schema.offers).where(eq(schema.offers.id, offerId)).get()?.channelMessageId ??
  null;

test('renders the post: pair, rate with total, methods, note, status, footer', () => {
  const { db } = wire();
  const offer = createOffer(db, alex, input);
  const lines = renderOffer(getOffer(db, offer.id)).split('\n');

  assert.deepEqual(lines.slice(0, 5), [
    '<b>Alex gives 200 USDT for RUB</b>',
    '1 USDT = 96.5 RUB ≈ 19,300 RUB',
    'USDT: TRC20',
    'RUB: SBP, Tinkoff',
    '<i>Technopark lobby</i>',
  ]);
  assert.equal(lines[5], '● Active — 200 USDT available');
  assert.match(lines[6]!, /^#\d+ · Alex, 0 deals · expires (today|tomorrow) \d\d:\d\d$/);
});

test('renders paused, negotiable, no-expiry and partially claimed offers', () => {
  const { db } = wire();
  db.insert(schema.users).values({ id: alex.id, firstName: alex.first_name }).run();
  const open = createOffer(db, nour, {
    ...input,
    rate: null,
    negotiable: true,
    expiresInHours: null,
    note: null,
  });
  const lines = renderOffer(getOffer(db, open.id)).split('\n');
  assert.equal(lines[1], 'Rate negotiable');
  assert.equal(lines.at(-1), `#${open.id} · Nour, 0 deals · no expiry`);

  db.insert(schema.claims)
    .values([
      {
        offerId: open.id,
        takerId: alex.id,
        amount: toMinor(50),
        method: 'SBP',
        status: 'confirmed',
      },
      { offerId: open.id, takerId: alex.id, amount: toMinor(20), method: 'SBP', status: 'pending' },
    ])
    .run();
  const claimed = renderOffer(getOffer(db, open.id)).split('\n');
  assert.equal(claimed[4], '● Partially filled — 150 of 200 USDT left');
  assert.equal(claimed[5], '50 USDT reserved · 20 USDT requested, awaiting confirmation');

  applyOfferAction(db, nour.id, open.id, 'pause');
  assert.equal(renderOffer(getOffer(db, open.id)).split('\n')[4], '● Paused');
});

test('escapes HTML in names and notes', () => {
  const { db } = wire();
  const offer = createOffer(
    db,
    { id: 3, first_name: '<b>Mallory</b>' },
    { ...input, note: 'a & b' },
  );
  const text = renderOffer(getOffer(db, offer.id));
  assert.ok(text.includes('&lt;b&gt;Mallory&lt;/b&gt;'), text);
  assert.ok(text.includes('<i>a &amp; b</i>'), text);
});

test('publishes on create, edits in place on change, deletes when closed', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, input);
  await flushChannelSync();
  assert.deepEqual(
    calls.map((c) => c.method),
    ['send'],
  );
  assert.equal(messageId(db, offer.id), 100);

  applyOfferAction(db, alex.id, offer.id, 'pause');
  await flushChannelSync();
  assert.equal(calls.at(-1)?.method, 'edit');
  assert.equal(calls.at(-1)?.messageId, 100);
  assert.ok(calls.at(-1)?.text?.includes('● Paused'));

  applyOfferAction(db, alex.id, offer.id, 'close');
  await flushChannelSync();
  assert.equal(calls.at(-1)?.method, 'delete');
  assert.equal(messageId(db, offer.id), null, 'the post is gone, so is its id');
});

test('coalesces a burst into one render', async () => {
  const { db, calls } = wire();
  const offer = createOffer(db, alex, input);
  applyOfferAction(db, alex.id, offer.id, 'pause');
  applyOfferAction(db, alex.id, offer.id, 'resume');
  await flushChannelSync();
  assert.deepEqual(
    calls.map((c) => c.method),
    ['send'],
    'three changes before the first call drains: one post, no edits',
  );
});
