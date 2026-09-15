# Feature: claims

The handshake: a taker requests part of an offer, the poster confirms or declines, both sides mark
the deal done. Spec: [spec.md](../spec.md) → Domain model (Claim), Mini app screens 2/3/5, Bot
handshake notifications, Business rules.

**Status (2026-09-15):** done on all three surfaces, bot chat included, and the 12 h auto-decline
runs in the scheduler. The poster's confirmation now reaches the taker as their own claim card
(handle, `[Mark as done]`, `[Release]`), and a DM can no longer be lost to the other side's failure
— see § Bot. A take now also asks which of the offer's own methods the taker wants the money on
(`claims.receiveMethod`). Not yet verified against a real chat.

## The same feature on each surface

| Action          | Mini app                                                                                           | Bot chat                                                                                         | Channel                             |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Take            | `/offers/$offerId/take` `TakePage` (deep link `startapp=take_<id>`): amount, pay with, receive via | take wizard from `?start=take_<id>`: the same three questions, then the request DM to the poster | "N requested" line; Take button     |
| Confirm/Decline | `ClaimRow` under the offer in My offers                                                            | `[Confirm]` `[Decline]` on that DM                                                               | reserved amount moves the status    |
| Cancel/Release  | `ClaimCard` on the offer detail (taker), `ClaimRow` (poster)                                       | `[Cancel request]` / `[Release]` on either side's card; the other side is told                   | amount returns to available         |
| Mark done       | `ClaimCard` / `ClaimRow`, two-sided                                                                | `[Mark as done]`, then `[Done on my side too]` / `[Not yet]`                                     | post deleted once the offer is full |
| Your requests   | `/my` → "Your requests" (`RequestRow`)                                                             | `/mine` — a taker card per open request, with its buttons                                        | —                                   |

## API — `apps/bot/src/features/claims/api.ts` (all behind `telegramAuth`)

| Route                                                        | Returns                             | Errors                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/claims/mine`                                       | `MyClaim[]`, newest first           |                                                                                                                               |
| `POST /api/claims` body `ClaimInput`                         | 201 `OfferDetail`                   | 400 validation / `unknown-method`, 403 `own-offer`, 404, 409 `offer-unavailable` `already-claimed` `amount-exceeds-remaining` |
| `POST /api/claims/:id/{confirm,decline,cancel,release,done}` | `OfferDetail` of the affected offer | 403 `not-your-claim`, 404 `claim-not-found`, 409 `invalid-transition` `amount-exceeds-remaining`                              |

Every route answers with the **offer**, so one response refreshes both the claim and the
availability the other screens show. The mini app writes it straight into the detail cache.

## Rules — `service.ts`

- Take: offer must be `active`, not your own, `method ∈ offer.getMethods` (what the taker pays
  with), `receiveMethod ∈ offer.giveMethods` (what they take it on), `amount ≤ remaining`, and you
  may hold only one open (pending or confirmed) claim per offer at a time. Both methods are asked
  on both surfaces — the poster's card then says where to send without asking in chat
  (`claim-receive-method`), and the taker's says it back (`your-request`).
- **Pending reserves nothing** — `availability()` in `@sarraf/shared` is the one definition.
  Confirming is what moves the amount, so confirm re-checks `amount ≤ remaining` (two pending
  requests can both fit individually but not together — the second gets `amount-exceeds-remaining`).
- Who may do what: confirm/decline are the poster's, cancel is the taker's, release and done are
  either side's. Anything else is `not-your-claim`; a repeat is `invalid-transition` (the bot's
  stale buttons rely on this being idempotent-by-error).
- Release means the same from either side, but is recorded honestly: the poster's release is a
  `declined`, the taker's is a `cancelled`.
- `timeout` is a sixth action, the scheduler's: a `pending` claim becomes `declined` in the poster's
  name, but the taker reads `claim-dm-timeout` ("no answer") and the poster's card says
  `claim-line-timeout`, because nobody actually declined anything. It is not on the API's action
  list — no surface but the scheduler may claim someone did not answer.
- Done is two-sided: the first tap sets `takerDone`/`posterDone`, the second flips the claim to
  `done`. When `filled === giveAmount` the offer becomes `completed` and its post is deleted.
- Contact gating: handles are exchanged **only** between the two sides of a confirmed claim
  (`getOffer(db, id, viewerId)` and `listClaimsByTaker`). `listOffers` never reveals one.

## Bot — `card.ts` (rendering), `bot.ts` (buttons), `notify.ts` (messages), `wizard.ts` (take)

One DM per claim carries the poster's decision, stored as `claims.posterMessageId` and
**re-rendered on every transition, whichever surface caused it** — confirming in the mini app also
stops the bot's `[Confirm]` `[Decline]` from offering a second answer. The card shows the request, then
the state line (confirmed / declined / cancelled / released / waiting for the other side / done) and
the buttons that still apply.

The side that did _not_ act gets a DM, because editing a message is silent; on completion both do.
`claim-dm-*` in the catalogue, always in the **recipient's** stored locale (`users.locale`). Message
buttons use `t.me/<username>`, falling back to `tg://user?id=` — a bot may link to a user by id, so
a missing handle is usually not a dead end here (the mini app has no such fallback). A confirmed
card also prints the handle as text (`contact-handle`), which is copyable and survives a refused
button.

**Someone with no username and forwarding privacy set to "Nobody" cannot be linked to at all** —
that is the point of the setting, and no Bot API method routes around it. The other side's card
then carries no contact button; whichever party _can_ be linked to gets messaged first, and the
deal proceeds from there. If that ever stops being rare, the options are a "set a @username" nudge
after the first confirmed claim, or relaying messages through the bot.

`claimCard(parties, role, t)` renders the same claim from either side: the poster's request DM, the
taker's card under `/mine`, **and the DM the taker gets when the poster confirms** — so that
notification carries the handle and `[Mark as done]` `[Release]`, not just "they confirmed". After a
button is tapped, the card it sat on is re-rendered from the tapper's side unless it is the poster's
request DM, which the notifier owns.

Two things a DM must survive, both learned the hard way (a taker who was never told they had been
confirmed):

- **The two sides are notified independently** (`Promise.allSettled` in `deliver`). A poster's card
  that cannot be edited used to throw before the taker's DM was ever attempted.
- **A button Telegram refuses costs that button, not the message.** `tg://user?id=` is rejected for
  users whose privacy settings forbid linking to them (`BUTTON_USER_PRIVACY_RESTRICTED`) and takes
  the whole `sendMessage` (or `editMessageText`) with it. Both retry once with
  `withoutUserLinks(markup)`, which drops the `tg://` button and keeps `[Mark as done]`
  `[Release]` — the refused shortcut must not cost the buttons the deal runs on.

A DM that is dropped on purpose (blocked bot, deleted account, a chat the user never started) is
logged as `dm to <id> dropped`. That line is the first place to look when someone says they got
nothing.

Callback data is `claim:<button>:<id>` (`claimCallback` in `@sarraf/shared`). Every callback is
answered; one on a claim that has moved on answers "Already closed" and drops the keyboard rather
than acting twice, which is what makes a week-old message in a chat safe. Sends go through the same
fire-and-forget queue as the channel post (`lib/telegram-queue.ts`): a failed DM never fails the
handshake, and a taker who blocked the bot is not an error.

## Mini app files

`entities/claim/{model,api,format}.ts` · `pages/take/TakePage.tsx` ·
`features/manage-claim/ClaimCard.tsx` (the taker's own request on the offer detail) ·
`features/manage-claim/ClaimRow.tsx` (a request under the poster's own offer) ·
`pages/my-offers/RequestRow.tsx`.

`ClaimRow` prints both of the claim's methods (`claim-methods`: what the taker pays with, what they
want the money on), which is the mini app's half of what the request DM tells the poster.

A "Message X" button only appears when the other side has a Telegram username: a mini app can open
`t.me/<username>` but not a `tg://user?id=` link. The bot's own notifications reach those users by id.
Both cards print the handle as text next to that button once the claim is confirmed — `ClaimCard`
as its description (`contact-handle`, the bot's own line), `ClaimRow` as `· @handle` after the name,
because a row has no room for a sentence. That is the half of contact a mini app can always deliver.

## When a request ends without anyone deciding

Two paths, both `applyClaimAction` with the poster as the actor, so the channel post, the poster's
request DM and the taker's DM all happen exactly as they do for a tap:

- **12 h of silence** — `apps/bot/src/scheduler.ts` finds `pending` claims older than 12 h and
  applies `timeout` (decisions log 2026-09-12). Idempotent because the claim leaves `pending`.
- **The offer ends** — `applyOfferAction(…, 'close' | 'expire')` collects the offer's pending claims
  and applies `decline` (a close is the poster's decision) or `timeout` (an expiry is nobody's).
  Confirmed reservations survive both. This is what used to be one bulk `UPDATE` that told no one.
