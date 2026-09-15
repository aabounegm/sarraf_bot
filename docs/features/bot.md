# Feature: bot chat

The chat half of the product: the menu, the `/new` wizard, `/mine`, and the take wizard behind the
channel's [Take] button. Spec: [spec.md](../spec.md) → § B (bot chat).

**Status (2026-09-14):** done. Everything a user can do in the mini app they can now do in the
chat. The offer and claim _rules_ live in the services both surfaces call — this slice only asks
questions and renders cards.

## Entry points

| What                     | Where                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `/start`                 | `bot/menu.ts` — welcome + the persistent reply keyboard                                          |
| `/start take_<id>`       | `features/claims/bot.ts` → take wizard (the channel's [Take], bot half)                          |
| `/new`, [New offer]      | `features/offers/bot.ts` → offer wizard                                                          |
| `/mine`, [My offers]     | `features/offers/bot.ts` → one card per offer, then your requests                                |
| `/board`                 | `bot/menu.ts` — a message with an inline `web_app` button                                        |
| `/help`, [Help]          | `bot/menu.ts`                                                                                    |
| `/cancel`                | `bot/menu.ts` — `conversation.exitAll()`                                                         |
| [Browse offers]          | a `web_app` keyboard button: opens the mini app with no message in between                       |
| Buttons on claim cards   | `features/claims/bot.ts` (`claim:<button>:<id>`)                                                 |
| Buttons on `/mine` cards | `features/offers/bot.ts` (`offer:<button>:<id>`)                                                 |
| Scheduler DMs            | `features/offers/notify.ts` sends them; their buttons are the same `offer:<button>:<id>` handler |

The reply keyboard is `[Browse offers] [New offer] / [My offers] [Help]`, built once in
`menuKeyboard`. Its three text buttons are matched by `hears('<message-id>')` from `@grammyjs/i18n`,
so they work in every locale. **Deviation from the spec:** `/start` sends _one_ message. A message
carries either a reply keyboard or an inline keyboard, not both, and the keyboard's first button
already opens the mini app, so the separate inline "Open InnoExchange" button lives in `/board`.

Telegram's "/" menu is filled at boot: `registerCommands` (`bot/menu.ts`) is called from `main.ts`
after `bot.init()` and sends `setMyCommands` four times — the English default plus one call per
locale, all scoped `all_private_chats`, because this is a private-chat product. It is fire and
forget: a rejection is logged, and an empty "/" menu costs a tap, nothing more. `/start` is left
out of it on purpose — the client offers it as a Start button before the chat begins, and after
that the reply keyboard is the way back to the menu.

The menu and `/help` are **one list**: `COMMANDS` in `bot/menu.ts`, built from the `*_COMMAND`
constants the handlers themselves register with (`/new` and `/mine` are handled in
`features/offers/bot.ts` and import theirs), and one `command-<name>` message per entry in the
catalogue. `/help` interpolates the rendered lines as `{ $commands }`, so the two cannot drift, and
a command is renamed in one constant plus its description in three locales. `bot/menu.test.ts`
walks `COMMANDS` and fails if one of them has no description or no handler that answers.

## The wizards — `bot/wizard.ts` plus one file per flow

`@grammyjs/conversations` v2, registered after the session plugin and given its own slice of the
`sessions` table (`prefix: 'conversation-'`, the same `sqliteStorage` adapter). Conversations run
outside the middleware tree, so i18n is installed a second time inside them
(`conversations({ plugins: [i18n] })`) and the context there is `WizardContext` — i18n but no
session and no `ctx.conversation`.

`bot/wizard.ts` holds the three question shapes every flow is made of, so neither wizard builds a
keyboard by hand:

- `choose` — one question, one tap; the answer is edited into the question ("✓ USDT") and the
  buttons go away, so the chat reads like a filled-in form. When editing, the answer already on the
  offer is ticked — the tick _is_ the "keep" for a chip step.
- `chooseMany` — the multi-select from the spec: buttons toggle "✓ TRC20" by editing their own
  message, the footer counts ("Done (2)") and refuses to finish empty ("Pick at least one").
- `askText` — a typed answer, with optional buttons that answer instead ("Skip", "Negotiable, no
  rate", "Keep 200 USDT"). `parse` returns either the value or the complaint the user gets back.

Every step's keyboard ends in **[Cancel]**, handled in the wait helper rather than by the steps, so
a wizard is never a room without a door (the reply keyboard below stays on the menu).

Every step waits through one helper, which is what keeps a wizard from swallowing the rest of the
bot:

- a **command** or a **reply-keyboard button** ⇒ `halt({ next: true })`: the wizard ends and the
  update is handled normally, so `/mine` mid-wizard just works.
- a **callback that is not ours** (no `w:` prefix — a claim card, an old offer card) ⇒
  `skip({ next: true })`: handled downstream, and the wizard stays exactly where it was.
- anything else ⇒ the step re-asks.

`conversation.external` wraps every database read and write, because the conversation function is
replayed from the start on each update. Only plain JSON crosses that boundary: services return ids
and error _codes_, never `AppError` instances (see `errorText` in `lib/app-error.ts`).

### `/new` and [Edit] — `features/offers/wizard.ts`

give currency → amount → give methods → get currency (the give currency is not offered) → get
methods → rate (typed, then "Fixed / Asking · negotiable") or "Negotiable, no rate" → expiry
(6/12/24/48h / None) → note (or Skip) → **preview** rendered by the very function that writes the
channel post, with [Post to channel] / [Start over] [Cancel].

The result is `OfferInput.parse(...)` handed to `createOffer` — the same call the mini app's form
makes. [Edit] enters the same wizard with the offer's current answers: the first question opens
with "Editing #1042." instead of "New offer.", chips and multi-selects come pre-ticked, each typed
step gains a "Keep …" button, and the preview posts under [Save changes]. A "keep" is only offered
while it still means something — change the give currency and the old amount and rate stop being
offered, because neither survives the change. The expiry has no "keep" at all (it is re-counted
from now), so the question says what it is at the moment instead. Deliberately not per-field editing; if
walking eight steps to change an amount annoys anyone, that is the upgrade path.

### Take — `features/claims/wizard.ts`

The offer card, then amount (typed, or [All 200 USDT], never more than `remaining`) → method (only
`offer.getMethods`) → confirm, ending in `createClaim`, which notifies the poster and re-renders the
channel post. The rules are checked once before the questions and again by the service.

**Contact gating holds here:** the wizard shows the poster's first name only. A handle is earned by
a confirmed claim, and only `claimCard` shows one.

## Cards

- **Offer card** (`/mine`): `renderOffer` — the channel post's own renderer, in the reader's
  locale — plus one line per live request ("Karim · 200 AED via Cash · asks if available") and
  [Edit] [Pause|Resume] [Close]. Finished offers are left to the mini app; the chat only carries
  what you can still act on.
  [Close] asks first (an alert plus a [Close] [Cancel] row) because closing deletes the post and
  declines pending requests.
- **Scheduler DMs** ([offers.md](offers.md) § Scheduler): "expired" with [Repost], "still on?" with
  [Yes, still on] [Pause] [Close], "paused" with [Resume]. They carry `offer:` callbacks, so the
  `/mine` handler answers them and re-renders the DM as the offer card — no second set of buttons
  and no second truth. `repost` and `checkin` are new `OFFER_BUTTONS`; `keep` was not widened,
  because it means "put the card back", not "yes, still on".
- **Claim card** (`features/claims/card.ts`): one renderer, two roles. The poster's copy is the
  request DM kept in sync by `notify.ts`; the taker's is a row of `/mine` with [Cancel request] or
  [Message X] [Mark as done] [Release]. After any claim button, the card that was tapped is
  re-rendered from the tapper's side, so no message in the chat can keep offering an answer that is
  already spent.

## Rules this slice must not break

- Every callback is answered — including by a catch-all at the end of the middleware stack, which
  answers "Already closed" for a button whose wizard or message is long gone.
- Callback data is built in `@sarraf/shared` (`claimCallback`, `offerCallback`). The wizards' own
  step buttons are the exception: they carry no id, live only as long as the question is on screen,
  and are built and read three lines apart in `bot/wizard.ts`.
- Strings come from the catalogue. `ctx.t` in handlers and wizards; `i18n.t(locale, …)` only where
  there is no context (`notify.ts`, the channel post).

## Known ceilings

- One conversation per chat: starting a wizard ends whatever was running (`exitAll` then `enter`).
- In a group chat the reply keyboard's `web_app` button is rejected by Telegram and `/start` fails
  with a logged error. The bot is a private-chat product; add a chat-type filter if it ever ends up
  in a group.
- The "/" menu is registered once at boot, so a catalogue change reaches Telegram on the next
  restart (and only for the locales the catalogue has — every other client sees the English one).

## Tests

`bot/testing.ts` is the harness: a bot whose Telegram calls are recorded at the `fetch` level (a
conversation builds its own `Api`, so a transformer on `bot.api` would not see a wizard's messages),
plus `say`, `tap(label)` and `sent`. `features/offers/bot.test.ts` walks the whole `/new` wizard and
checks the offer it wrote, the edit flow, `/mine`'s buttons acting on the right offer, a claim
button tapped mid-wizard, and someone else's card refusing to answer;
`features/claims/bot.test.ts` covers the handshake buttons and the `take_<id>` deep link;
`bot/menu.test.ts` walks `COMMANDS` and checks each one has a description and a handler that
answers.
