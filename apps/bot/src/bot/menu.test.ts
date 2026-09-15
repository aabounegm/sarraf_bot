import assert from 'node:assert/strict';
import { test } from 'node:test';

import { COMMANDS } from './menu.ts';
import { harness } from './testing.ts';

const nadia = { id: 1, first_name: 'Nadia' };

// The "/" menu is built from the same COMMANDS list, so this also says the menu has a description
// for each: a missing `command-<x>` message would leave the key itself in the text.
test('/help lists every command with its description', async () => {
  const h = harness();

  await h.say(nadia, '/help');

  const help = h.sent(nadia.id).at(-1)!.text!;
  for (const command of COMMANDS) assert.match(help, new RegExp(`/${command} — \\S`));
  assert.doesNotMatch(help, /command-/);
});

// The menu advertises commands that are registered elsewhere (`/new` and `/mine` live in
// features/offers/bot.ts), so this is what says the list still points at handlers that exist.
test('every command in the menu answers', async () => {
  for (const command of COMMANDS) {
    const h = harness();
    await h.say(nadia, `/${command}`);
    assert.ok(h.sent(nadia.id).length > 0, `/${command} said nothing`);
  }
});
