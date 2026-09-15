# Feature: bot chat

The chat half of the product: the menu, the board, the `/new` wizard, `/mine`, and the take wizard
behind the channel's `[Take]` button. Spec: [spec.md](../spec.md) → § B (bot chat).

**Status (2026-09-15):** done. Everything a user can do in the mini app they can now do in the
chat, browsing included (`/board`, added 2026-09-15). The offer and claim _rules_ live in the
services both surfaces call — this slice only asks questions and renders cards.

## Entry points

| What                     | Where                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `/start`                 | `bot/menu.ts` — welcome + the persistent reply keyboard                                          |
| `/start take_<id>`       | `features/claims/bot.ts` → take wizard (the channel's `[Take]`, bot half)                        |
| `/new`, `[New offer]`    | `features/offers/bot.ts` → offer wizard                                                          |
| `/mine`, `[My offers]`   | `features/offers/bot.ts` → one card per offer, then your requests                                |
| `/board`                 | `features/offers/board.ts` — the board in the chat, one offer per tap                            |
| `/help`, `[Help]`        | `bot/menu.ts`                                                                                    |
| `/cancel`                | `bot/menu.ts` — `conversation.exitAll()`                                                         |
| `[Browse offers]`        | `features/offers/board.ts` — the same board `/board` opens                                       |
| `[Open InnoExchange]`    | a `web_app` keyboard button: opens the mini app with no message in between                       |
| `[Take]` on a board card | `features/claims/bot.ts` (`take:<id>`) → the same take wizard as the deep link                   |
| Buttons on claim cards   | `features/claims/bot.ts` (`claim:<button>:<id>`)                                                 |
| Buttons on `/mine` cards | `features/offers/bot.ts` (`offer:<button>:<id>`)                                                 |
| Scheduler DMs            | `features/offers/notify.ts` sends them; their buttons are the same `offer:<button>:<id>` handler |

The reply keyboard is `[Browse offers] [New offer] / [My offers] [Help] / [Open InnoExchange]`,
built once in `menuKeyboard`. Its four text buttons are matched by `hears('<message-id>')` from
`@grammyjs/i18n`, so they work in every locale; the fifth is a `web_app` button and sends no
message, which is why `MENU_KEYS` (what a wizard hands back rather than reading as an answer) is
only the four. **Deviation from the spec:** `/start` sends _one_ message. A message carries either
a reply keyboard or an inline keyboard, not both, so the spec's separate inline "Open InnoExchange"
button is the keyboard's last row instead.

What Telegram shows before the user types anything is registered at boot by `registerMenu`
(`bot/menu.ts`), called from `main.ts` after `bot.init()` and fire and forget — a rejection is
logged, and both of its halves are shortcuts to something the chat already offers:

- **The "/" menu** — `setMyCommands` four times: the English default plus one call per locale, all
  scoped `all_private_chats`, because this is a private-chat product. `/start` is left out on
  purpose: the client offers it as a Start button before the chat begins, and after that the reply
  keyboard is the way back to the menu.
- **The button next to the message input** — `setChatMenuButton` with a `web_app` button that opens
  the mini app. It _replaces_ the commands button that would otherwise sit there; typing `/` still
  completes the commands, and the reply keyboard has `[Open InnoExchange]`. There is one default
  button and no `language_code` on that method, so its label is English for everyone, like the
  channel post. Per-chat calls in `/start` would localise it, at one API call per `/start`.

The bot's profile page ("Open App") and the `t.me/<bot>/app?startapp=` links in the channel post are
_not_ set from here: the mini app is registered in BotFather (see
[deployment.md](../deployment.md) step 3), and no Bot API method can do it.

The menu and `/help` are **one list**: `COMMANDS` in `bot/menu.ts`, built from the `*_COMMAND`
constants the handlers themselves register with (`/new` and `/mine` are handled in
`features/offers/bot.ts` and import theirs), and one `command-<name>` message per entry in the
catalogue. `/help` interpolates the rendered lines as `{ $commands }`, so the two cannot drift, and
a command is renamed in one constant plus its description in three locales. `bot/menu.test.ts`
walks `COMMANDS` and fails if one of them has no description or no handler that answers.

## The board — `features/offers/board.ts`

`/board` used to be a link to the mini app, which the reply keyboard and the menu button already
were. It is now the board itself: **one active offer per screen, in one message**, edited in place
as you page or filter, so browsing costs the chat a single message no matter how long you browse.

```
Offer 3 of 12
<the channel post's own renderer, in the reader's locale>
         [ ◀ ]  [ Take ]  [ ▶ ]
 [✓ Anything] [USDT] [USD] [EUR]
 [AED] [RUB] [EGP]
        [ Open InnoExchange ]
```

- The whole state is the callback data — `board:<any|CUR>:<index>` (`boardCallback` in
  `@sarraf/shared`). No session, no cursor table, and a board message left in the chat overnight
  still works.
- The list is re-read on every tap (`listOffers`, `active` only, newest first), so nothing on
  screen can be an offer that has since gone. Paging wraps; an index from a list that has shrunk
  is clamped to the last offer. **Known ceiling:** the position is an index into a live list, so an
  offer closing mid-browse shifts what the next tap lands on. A `createdAt` cursor is the upgrade.
- `[Take]` carries `take:<id>` and enters the take wizard — the same conversation
  `?start=take_<id>` enters, so there is one take flow in the chat, not two. It is hidden on your
  own offer and when nothing is remaining, the two cases the mini app hides it in; the service
  refuses either way.
- The chips are the mini app's "I'm looking for", ticked like every other choice the bot offers
  (`✓ USDT`). `board-prev` / `board-next` are catalogue entries, so Arabic flips the arrows.

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

Every step's keyboard ends in **`[Cancel]`**, handled in the wait helper rather than by the steps, so
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

### `/new` and `[Edit]` — `features/offers/wizard.ts`

give currency → amount → give methods → get currency (the give currency is not offered) → get
methods → rate (typed, then "Fixed / Asking · negotiable") or "Negotiable, no rate" → expiry
(6/12/24/48h / None) → note (or Skip) → **preview** rendered by the very function that writes the
channel post, with `[Post to channel]` / `[Start over]` `[Cancel]`.

The result is `OfferInput.parse(...)` handed to `createOffer` — the same call the mini app's form
makes. `[Edit]` enters the same wizard with the offer's current answers: the first question opens
with "Editing #1042." instead of "New offer.", chips and multi-selects come pre-ticked, each typed
step gains a "Keep …" button, and the preview posts under `[Save changes]`. A "keep" is only offered
while it still means something — change the give currency and the old amount and rate stop being
offered, because neither survives the change. The expiry has no "keep" at all (it is re-counted
from now), so the question says what it is at the moment instead. Deliberately not per-field editing; if
walking eight steps to change an amount annoys anyone, that is the upgrade path.

### Take — `features/claims/wizard.ts`

The offer card, then amount (typed, or `[All 200 USDT]`, never more than `remaining`) → method (only
`offer.getMethods`) → confirm, ending in `createClaim`, which notifies the poster and re-renders the
channel post. The rules are checked once before the questions and again by the service.

**Contact gating holds here:** the wizard shows the poster's first name only. A handle is earned by
a confirmed claim, and only `claimCard` shows one.

## Cards

- **Offer card** (`/mine`): `renderOffer` — the channel post's own renderer, in the reader's
  locale — plus one line per live request ("Karim · 200 AED via Cash · asks if available") and
  `[Edit]` `[Pause|Resume]` `[Close]`. Finished offers are left to the mini app; the chat only carries
  what you can still act on.
  `[Close]` asks first (an alert plus a `[Close]` `[Cancel]` row) because closing deletes the post and
  declines pending requests.
- **Scheduler DMs** ([offers.md](offers.md) § Scheduler): "expired" with `[Repost]`, "still on?" with
  `[Yes, still on]` `[Pause]` `[Close]`, "paused" with `[Resume]`. They carry `offer:` callbacks, so the
  `/mine` handler answers them and re-renders the DM as the offer card — no second set of buttons
  and no second truth. `repost` and `checkin` are new `OFFER_BUTTONS`; `keep` was not widened,
  because it means "put the card back", not "yes, still on".
- **Claim card** (`features/claims/card.ts`): one renderer, two roles. The poster's copy is the
  request DM kept in sync by `notify.ts`; the taker's is a row of `/mine` — and the DM they get when
  the poster confirms — with `[Cancel request]` or `[Message X]` `[Mark as done]` `[Release]`. After any claim button, the card that was tapped is
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
`features/offers/board.test.ts` pages the board, filters it, takes from it and checks your own
offer has no `[Take]`;
`bot/menu.test.ts` walks `COMMANDS` and checks each one has a description and a handler that
answers.
