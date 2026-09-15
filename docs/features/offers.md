# Feature: offers

Posting, browsing, editing, pausing/resuming and closing swap offers.
Spec: [spec.md](../spec.md) → Domain model, Mini app screens 1/2/4/5, Business rules.

**Status (2026-09-14):** done — API, mini app, channel post, the bot chat, and the scheduler that
expires offers and checks in on the ones with no expiry. The bot's own side is described in
[bot.md](bot.md).

## The same feature on each surface

| Action                 | Mini app                                                                                                        | Bot chat                                                                     | Channel                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Browse                 | `/` `BrowsePage` — chips filter by give currency; only `active` offers (paused/finished ones live in My offers) | `/board` or `[Browse offers]` — one offer at a time, same chips (`board.ts`) | —                                                                |
| Detail                 | `/offers/$offerId` `OfferPage` — header, progress (filled grey / reserved amber), details, note, other takers   | —                                                                            | one post per offer, `channel.ts`                                 |
| Create                 | `/offers/new` `OfferForm`                                                                                       | `/new` step-by-step wizard, `[New offer]`                                    | post published on create                                         |
| Edit                   | `/offers/$offerId/edit`                                                                                         | `[Edit]` on a `/mine` card: the wizard, prefilled                            | post edited in place                                             |
| Pause / Resume / Close | `OfferActions` on detail (own offers) and on My offers                                                          | buttons on a `/mine` card (`[Close]` asks first)                             | "🔴 Paused" line / post deleted on close                         |
| My offers              | `/my` `MyOffersPage` (Your requests section arrives with claims)                                                | `/mine`, `[My offers]` — a card per offer                                    | —                                                                |
| Expire / check in      | an expired offer keeps a `[Repost]` button, in My offers and on its detail page                                 | the scheduler's DMs, with `[Repost]` / `[Yes, still on]` `[Pause]` `[Close]` | post deleted on expiry, "🔴 Paused" after an unanswered check-in |

Deep links: `startapp=offer_<id>` → `/offers/<id>`, `startapp=take_<id>` → the take screen, and
`?start=take_<id>` runs the bot's take wizard. Parsing: `parseStartParam` in `@sarraf/shared`.
The channel post's buttons are `t.me/<bot>?startapp=take_<id>` and `…?startapp=offer_<id>` — the
**main** Mini App form. `t.me/<bot>/<short>?startapp=` is a different object (a named app from
`/newapp`); with only the main app configured it opens the chat and drops the parameter, which is
what made both buttons look identical until 2026-09-15. See [deployment.md](../deployment.md) step 3.

## API — `apps/bot/src/features/offers/api.ts` (all behind `telegramAuth`)

| Route                                              | Returns                              | Errors                                                                   |
| -------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/offers?give=USDT`                        | `OfferSummary[]`, newest first       | 400 bad currency                                                         |
| `GET /api/offers/mine`                             | `OfferDetail[]` posted by the caller |                                                                          |
| `POST /api/offers` body `OfferInput`               | 201 `OfferDetail`                    | 400 validation                                                           |
| `GET /api/offers/:id`                              | `OfferDetail` (adds `claims[]`)      | 404 `offer-not-found`                                                    |
| `PUT /api/offers/:id` body `OfferInput`            | `OfferDetail`                        | 403 `not-your-offer`, 409 `amount-below-committed`, 409 `offer-finished` |
| `POST /api/offers/:id/{pause,resume,close,repost}` | `OfferDetail`                        | 403, 409 `invalid-transition`                                            |

Errors are `{ error: <code> }` via `AppError` (`apps/bot/src/lib/app-error.ts`); the mini app maps
codes to `error-*` strings. Amounts in requests and responses are integer minor units.

## Rules — `service.ts`

- Input validation is `OfferInput` from `@sarraf/shared` (give ≠ get, methods ⊆ `CURRENCY_METHODS`,
  rate > 0 unless negotiable, note ≤ 200, expiry ∈ {6, 12, 24, 48, null}). Callers must pass parsed
  input; the API does this with `zValidator`, the bot wizard calls `OfferInput.parse` at the end of
  its questions.
- `rate = null` forces `negotiable = true`.
- Edit: new amount ≥ filled + reserved; not allowed once closed/completed/expired.
- Transitions: pause (active→paused), resume (paused→active), close (active|paused→closed) and
  repost (expired→active, with a fresh 24h expiry) — those four are the API's action enum, and the
  mini app's `OfferAction`. Two more belong to the scheduler and its DMs, in the poster's name but
  on no route: expire (active|paused→expired) and checkin (active→active, "yes, still on").
- Close and expire decline _pending_ claims **through `applyClaimAction`** (`decline` for a close,
  `timeout` for an expiry), so every taker is told; _confirmed_ ones survive (the deal may still
  happen). See [claims.md](claims.md).
- Every action, and every edit, clears `offers.checkInAt` — the poster has just proved they are
  here, which is what the 48h check-in wanted to know.
- Expiry is recomputed from "now" on create, on edit and on repost.
- `poster.deals` = count of `done` claims where the user was poster or taker (`dealsByUser`).
- `ensureUser` upserts the poster's Telegram profile on create.

## Scheduler — `apps/bot/src/scheduler.ts`, DMs in `notify.ts`

`runDueWork(db, now)` is a plain function of the database and a clock; `startScheduler(db)` runs it
at boot and every 60s with `Date.now()` (wired in `main.ts`, so importing either module starts
nothing, and tests call `runDueWork` with whatever time they want to be). Two of its four jobs are
this feature's — the other two are in [claims.md](claims.md):

| Job        | Due when                                                                 | Does                                                                                                                     |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Expire     | `status ∈ (active, paused)` and `expiresAt <= now`                       | `applyOfferAction(…, 'expire')` → post deleted, pending claims timed out, poster gets `offer-dm-expired` with `[Repost]` |
| Check in   | `status = active`, no expiry, `checkInAt IS NULL`, `updatedAt` ≥ 48h old | writes `checkInAt = now`, then `offer-dm-checkin` with `[Yes, still on]` `[Pause]` `[Close]`                             |
| Auto-pause | `status = active` and `checkInAt` ≥ 24h old                              | `applyOfferAction(…, 'pause')` → the post says "🔴 Paused", poster gets `offer-dm-autopaused` with `[Resume]`            |

**`offers.checkInAt`** (nullable, the feature's one migration) means "asked, still waiting". Null is
the resting state; `updatedAt` is then the "when did we last hear from them" the 48h counts from,
because every poster action clears `checkInAt` and thereby bumps `updatedAt`. `[Yes, still on]` is the
`checkin` action, which is exactly that clearing and nothing else.

**Idempotency** is the database's, never memory: each job's own effect takes the row out of its own
query (expired is not `active`/`paused`; a set `checkInAt` is not `NULL`; a paused offer is not
`active`). A second tick, or a restart mid-tick, finds nothing to redo. The check-in writes
`checkInAt` _before_ queueing its DM, so the cost of a crash in between is one silent auto-pause
rather than a ping on every tick.

Known ceiling: the channel sync writes `channelMessageId` on the same row, so publishing (or
republishing) an offer postpones its next check-in by up to 48h. That only happens right after a
poster action, which would have reset the clock anyway.

`notify.ts` is the claims notifier's shape for offers: `startOfferNotifications({ api, db })` at
boot, a fire-and-forget queue, and the poster's stored `users.locale` because there is no `ctx`. Its
button labels are message ids named after the buttons (`repost`, `checkin`, `pause`, `close`,
`resume`), so a DM is one line of text and a list of `offerCallback` buttons.

## Channel — `apps/bot/src/features/offers/channel.ts`

The post body is `renderOffer(offer, t)` in `render.ts`, shared with the bot's own cards: the
channel renders it with `i18n.t('en', …)`, the bot with `ctx.t`.

`queueChannelSync(offerId)` is called at the end of `createOffer` / `updateOffer` /
`applyOfferAction`; `startChannelSync({ api, db, chat, botUsername })` wires it in `main.ts` after
`bot.init()` (before that — tests, scripts — queueing is a no-op). One post per offer, id stored in
`offers.channelMessageId`: published on the first sync, edited afterwards, deleted (and the id
cleared) once the offer is closed / completed / expired. If the post was removed in the channel by
hand, the next sync republishes it. Post body: title, rate + total, one methods line per side,
italic note, `● Status — availability`, contention line, `#id · poster, N deals · expires …`
(community timezone, English — see the decisions log). `flushChannelSync()` awaits the queue.

## Mini app files

`entities/offer/{model,api,format}.ts` (types from the API via `InferResponseType`, TanStack Query
hooks, localized formatting) · `features/offer-form/` (form state → `OfferInput`, validation drives
the primary button) · `features/manage-offer/OfferActions.tsx` · `widgets/offer-card/` ·
`pages/{browse,offer,offer-form,my-offers}/`.
