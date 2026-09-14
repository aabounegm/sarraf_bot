# Feature: offers

Posting, browsing, editing, pausing/resuming and closing swap offers.
Spec: [spec.md](../spec.md) → Domain model, Mini app screens 1/2/4/5, Business rules.

**Status (2026-09-14):** API, mini app, channel post and the bot chat all done; the expiry job
belongs to the scheduler phase. The bot's own side is described in [bot.md](bot.md).

## The same feature on each surface

| Action                 | Mini app                                                                                                        | Bot chat                                        | Channel                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------- |
| Browse                 | `/` `BrowsePage` — chips filter by give currency; only `active` offers (paused/finished ones live in My offers) | `/board`, [Browse offers] → the mini app        | —                                       |
| Detail                 | `/offers/$offerId` `OfferPage` — header, progress (filled grey / reserved amber), details, note, other takers   | —                                               | one post per offer, `channel.ts`        |
| Create                 | `/offers/new` `OfferForm`                                                                                       | `/new` step-by-step wizard, [New offer]         | post published on create                |
| Edit                   | `/offers/$offerId/edit`                                                                                         | [Edit] on a `/mine` card: the wizard, prefilled | post edited in place                    |
| Pause / Resume / Close | `OfferActions` on detail (own offers) and on My offers                                                          | buttons on a `/mine` card ([Close] asks first)  | "● Paused" line / post deleted on close |
| My offers              | `/my` `MyOffersPage` (Your requests section arrives with claims)                                                | `/mine`, [My offers] — a card per offer         | —                                       |

Deep links: `startapp=offer_<id>` → `/offers/<id>`, `startapp=take_<id>` → the take screen, and
`?start=take_<id>` runs the bot's take wizard. Parsing: `parseStartParam` in `@sarraf/shared`.

## API — `apps/bot/src/features/offers/api.ts` (all behind `telegramAuth`)

| Route                                       | Returns                              | Errors                                                                   |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/offers?give=USDT`                 | `OfferSummary[]`, newest first       | 400 bad currency                                                         |
| `GET /api/offers/mine`                      | `OfferDetail[]` posted by the caller |                                                                          |
| `POST /api/offers` body `OfferInput`        | 201 `OfferDetail`                    | 400 validation                                                           |
| `GET /api/offers/:id`                       | `OfferDetail` (adds `claims[]`)      | 404 `offer-not-found`                                                    |
| `PUT /api/offers/:id` body `OfferInput`     | `OfferDetail`                        | 403 `not-your-offer`, 409 `amount-below-committed`, 409 `offer-finished` |
| `POST /api/offers/:id/{pause,resume,close}` | `OfferDetail`                        | 403, 409 `invalid-transition`                                            |

Errors are `{ error: <code> }` via `AppError` (`apps/bot/src/lib/app-error.ts`); the mini app maps
codes to `error-*` strings. Amounts in requests and responses are integer minor units.

## Rules — `service.ts`

- Input validation is `OfferInput` from `@sarraf/shared` (give ≠ get, methods ⊆ `CURRENCY_METHODS`,
  rate > 0 unless negotiable, note ≤ 200, expiry ∈ {6, 12, 24, 48, null}). Callers must pass parsed
  input; the API does this with `zValidator`, the bot wizard calls `OfferInput.parse` at the end of
  its questions.
- `rate = null` forces `negotiable = true`.
- Edit: new amount ≥ filled + reserved; not allowed once closed/completed/expired.
- Transitions: pause (active→paused), resume (paused→active), close (active|paused→closed).
  Close declines _pending_ claims; _confirmed_ ones survive (the deal may still happen).
- Expiry is recomputed from "now" on create and on edit.
- `poster.deals` = count of `done` claims where the user was poster or taker (`dealsByUser`).
- `ensureUser` upserts the poster's Telegram profile on create.

## Hook points for later phases

- Claims: `close` must notify takers of declined pending requests (see docs/features/claims.md).
- Scheduler: expire offers with `expiresAt <= now` → status `expired` (hidden from the board), then
  `queueChannelSync` deletes the post.

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
