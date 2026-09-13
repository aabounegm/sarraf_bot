# Feature: claims

The handshake: a taker requests part of an offer, the poster confirms or declines, both sides mark
the deal done. Spec: [spec.md](../spec.md) → Domain model (Claim), Mini app screens 2/3/5, Bot
handshake notifications, Business rules.

**Status (2026-09-13):** service, API and mini app done. The bot side (notifications with
Confirm/Decline, two-sided Done, contact buttons, idempotent stale callbacks) is the next phase —
until then a poster only sees requests in the mini app.

## The same feature on each surface

| Action          | Mini app                                                            | Bot chat                                                    | Channel                             |
| --------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------- |
| Take            | `/offers/$offerId/take` `TakePage` (deep link `startapp=take_<id>`) | take wizard from `?start=take_<id>` _(pending, bot-parity)_ | "N requested" line; Take button     |
| Confirm/Decline | `ClaimRow` under the offer in My offers                             | [Confirm] [Decline] on the request notification _(pending)_ | reserved amount moves the status    |
| Cancel/Release  | `ClaimCard` on the offer detail (taker), `ClaimRow` (poster)        | [Release] _(pending)_                                       | amount returns to available         |
| Mark done       | `ClaimCard` / `ClaimRow`, two-sided                                 | [Done on my side too] _(pending)_                           | post deleted once the offer is full |
| Your requests   | `/my` → "Your requests" (`RequestRow`)                              | `/mine` _(pending)_                                         | —                                   |

## API — `apps/bot/src/features/claims/api.ts` (all behind `telegramAuth`)

| Route                                                        | Returns                             | Errors                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/claims/mine`                                       | `MyClaim[]`, newest first           |                                                                                                                               |
| `POST /api/claims` body `ClaimInput`                         | 201 `OfferDetail`                   | 400 validation / `unknown-method`, 403 `own-offer`, 404, 409 `offer-unavailable` `already-claimed` `amount-exceeds-remaining` |
| `POST /api/claims/:id/{confirm,decline,cancel,release,done}` | `OfferDetail` of the affected offer | 403 `not-your-claim`, 404 `claim-not-found`, 409 `invalid-transition` `amount-exceeds-remaining`                              |

Every route answers with the **offer**, so one response refreshes both the claim and the
availability the other screens show. The mini app writes it straight into the detail cache.

## Rules — `service.ts`

- Take: offer must be `active`, not your own, `method ∈ offer.getMethods`, `amount ≤ remaining`,
  and you may hold only one open (pending or confirmed) claim per offer at a time.
- **Pending reserves nothing** — `availability()` in `@sarraf/shared` is the one definition.
  Confirming is what moves the amount, so confirm re-checks `amount ≤ remaining` (two pending
  requests can both fit individually but not together — the second gets `amount-exceeds-remaining`).
- Who may do what: confirm/decline are the poster's, cancel is the taker's, release and done are
  either side's. Anything else is `not-your-claim`; a repeat is `invalid-transition` (the bot's
  stale buttons rely on this being idempotent-by-error).
- Release means the same from either side, but is recorded honestly: the poster's release is a
  `declined`, the taker's is a `cancelled`.
- Done is two-sided: the first tap sets `takerDone`/`posterDone`, the second flips the claim to
  `done`. When `filled === giveAmount` the offer becomes `completed` and its post is deleted.
- Contact gating: handles are exchanged **only** between the two sides of a confirmed claim
  (`getOffer(db, id, viewerId)` and `listClaimsByTaker`). `listOffers` never reveals one.

## Mini app files

`entities/claim/{model,api,format}.ts` · `pages/take/TakePage.tsx` ·
`features/manage-claim/ClaimCard.tsx` (the taker's own request on the offer detail) ·
`features/manage-claim/ClaimRow.tsx` (a request under the poster's own offer) ·
`pages/my-offers/RequestRow.tsx`.

A "Message X" button only appears when the other side has a Telegram username: a mini app can open
`t.me/<username>` but not a `tg://user?id=` link. The bot's own notifications reach those users by id.

## Hook points for later phases

- Bot notifications: `createClaim` and `applyClaimAction` are the two places that must DM the other
  party (`bot.api`, not `ctx`), and edit the poster's original request message on every transition.
- Scheduler: pending claims older than 12 h are auto-declined (`applyClaimAction(..., 'decline')`
  with the poster as the actor) and the taker notified.
- Offer close already declines pending claims (`offers/service.ts`); those takers need notifying too.
