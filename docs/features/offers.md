# Feature: offers

Posting, browsing, editing, pausing/resuming and closing swap offers.
Spec: [spec.md](../spec.md) → Domain model, Mini app screens 1/2/4/5, Business rules.

**Status (2026-09-12):** API + mini app done. Bot entry points, channel post and the expiry job
belong to later phases (see the table — "pending" cells are the drift checklist).

## The same feature on each surface

| Action                 | Mini app                                                                                                      | Bot chat                                           | Channel                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| Browse                 | `/` `BrowsePage` — chips filter by give currency; shows active + paused; hides completed/closed/expired       | `/board` → opens the app _(pending)_               | —                                                    |
| Detail                 | `/offers/$offerId` `OfferPage` — header, progress (filled grey / reserved amber), details, note, other takers | —                                                  | one post per offer _(pending, channel-sync feature)_ |
| Create                 | `/offers/new` `OfferForm`                                                                                     | `/new` step-by-step wizard _(pending, bot-parity)_ | post created _(pending)_                             |
| Edit                   | `/offers/$offerId/edit`                                                                                       | Edit button under `/mine` cards _(pending)_        | post re-rendered _(pending)_                         |
| Pause / Resume / Close | `OfferActions` on detail (own offers) and on My offers                                                        | buttons under `/mine` cards _(pending)_            | "Paused" line / post deleted _(pending)_             |
| My offers              | `/my` `MyOffersPage` (Your requests section arrives with claims)                                              | `/mine` _(pending)_                                | —                                                    |

Deep links: `startapp=offer_<id>` → `/offers/<id>`; `take_<id>` lands on the same page until the
claims feature adds the take flow. Parsing: `parseStartParam` in `@sarraf/shared`.

## API — `apps/bot/src/features/offers/api.ts` (all behind `telegramAuth`)

| Route                                       | Returns                               | Errors                                                                   |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| `GET /api/offers?give=USDT`                 | `OfferSummary[]`, newest first        | 400 bad currency                                                         |
| `GET /api/offers/mine`                      | `OfferSummary[]` posted by the caller |                                                                          |
| `POST /api/offers` body `OfferInput`        | 201 `OfferDetail`                     | 400 validation                                                           |
| `GET /api/offers/:id`                       | `OfferDetail` (adds `claims[]`)       | 404 `offer-not-found`                                                    |
| `PUT /api/offers/:id` body `OfferInput`     | `OfferDetail`                         | 403 `not-your-offer`, 409 `amount-below-committed`, 409 `offer-finished` |
| `POST /api/offers/:id/{pause,resume,close}` | `OfferDetail`                         | 403, 409 `invalid-transition`                                            |

Errors are `{ error: <code> }` via `AppError` (`apps/bot/src/lib/app-error.ts`); the mini app maps
codes to `error-*` strings. Amounts in requests and responses are integer minor units.

## Rules — `service.ts`

- Input validation is `OfferInput` from `@sarraf/shared` (give ≠ get, methods ⊆ `CURRENCY_METHODS`,
  rate > 0 unless negotiable, note ≤ 200, expiry ∈ {6, 12, 24, 48, null}). Callers must pass parsed
  input; the API does this with `zValidator`, the bot wizard must call `OfferInput.parse`.
- `rate = null` forces `negotiable = true`.
- Edit: new amount ≥ filled + reserved; not allowed once closed/completed/expired.
- Transitions: pause (active→paused), resume (paused→active), close (active|paused→closed).
  Close declines _pending_ claims; _confirmed_ ones survive (the deal may still happen).
- Expiry is recomputed from "now" on create and on edit.
- `poster.deals` = count of `done` claims where the user was poster or taker (`dealsByUser`).
- `ensureUser` upserts the poster's Telegram profile on create.

## Hook points for later phases

- Channel sync: call `syncChannelPost(offerId)` at the end of `createOffer`, `updateOffer`, `applyOfferAction`.
- Claims: `close` must notify takers of declined pending requests.
- Scheduler: expire offers with `expiresAt <= now` → status `expired` (hidden from the board).

## Mini app files

`entities/offer/{model,api,format}.ts` (types from the API via `InferResponseType`, TanStack Query
hooks, localized formatting) · `features/offer-form/` (form state → `OfferInput`, validation drives
the primary button) · `features/manage-offer/OfferActions.tsx` · `widgets/offer-card/` ·
`pages/{browse,offer,offer-form,my-offers}/`.
