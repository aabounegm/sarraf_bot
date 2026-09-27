# Feature: alerts

"DM me when someone posts USDT → RUB." A standing subscription to one currency pair, so nobody has
to keep the channel unmuted or re-open the board to find out that the one offer they wanted exists.

**Status (2026-09-27):** done on both surfaces. Not yet exercised against a real chat.

An alert is written in the **offer's** vocabulary: `giveCurrency` is what a matching offer gives
(what you want to receive), `getCurrency` what it wants for it (what you would pay with). Payment
methods are optional on both sides — an empty list means "any", which is the default and what most
people want. An alert can be paused without being deleted.

There is **one alert per (user, pair)**: saving a pair you already watch edits its methods (and
un-pauses it) instead of adding a second row. The pair is the alert's identity on both surfaces,
which is why the API has no "create" separate from "edit".

## The same feature on each surface

| Action            | Mini app                                                                                                                                                                                                 | Bot chat                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| See your alerts   | `/alerts` `AlertsPage` (third tab of `NavTabs`)                                                                                                                                                          | `/alerts` — a card per pair with its own buttons                             |
| Add / edit a pair | the form on that page: two chip rows + optional method lists. Tapping a row loads it into the form (the row truncates its methods, the form shows them all) and the button then reads "Update this pair" | `[+ Add a pair]` → the alert wizard (pair, then methods with `[Any method]`) |
| Pause / resume    | the switch on the alert's row                                                                                                                                                                            | `[Pause]` / `[Resume]` on its card — and on every alert DM                   |
| Delete            | the red trash button on the row (no confirmation — re-adding a pair is two taps)                                                                                                                         | `[Delete]` on the card                                                       |
| A match arrives   | —                                                                                                                                                                                                        | a DM: the offer as the channel renders it, `[Take]` `[Pause these alerts]`   |

## API — `apps/bot/src/features/alerts/api.ts` (all behind `telegramAuth`)

| Route                                        | Returns   | Errors                                                                |
| -------------------------------------------- | --------- | --------------------------------------------------------------------- |
| `GET /api/alerts`                            | `Alert[]` |                                                                       |
| `PUT /api/alerts` body `AlertInput`          | `Alert`   | 400 validation / `same-currency` / `unknown-method`                   |
| `POST /api/alerts/:id/{pause,resume,delete}` | `Alert`   | 403 `not-your-alert`, 404 `alert-not-found`, 409 `invalid-transition` |

## Rules — `service.ts`, matching in `packages/shared/src/alert.ts`

- `matchesAlert(offer, alert)`: the pair must be exactly the offer's (no partial or reverse match),
  and each named method list must overlap the offer's list on that side. An empty list matches
  anything. Shared, because both the DM and the mini app's copy describe the same rule.
- `matchingAlerts(db, offer)` narrows by pair and `paused = false` in SQL, then applies
  `matchesAlert`, and never returns the poster: nobody is told about their own offer.
- `saveAlert` upserts on `(userId, giveCurrency, getCurrency)` and resumes the alert it edits.
- `pause`/`resume` refuse the state the alert is already in (409), so a double tap says so.

## The DM — `notify.ts`

Queued like the channel post and the claim DMs (`createQueue`, `sendDm`): fire-and-forget, so a
blocked bot or a 429 can never fail the offer that caused it. Sent **when an offer is created** —
that is the moment the channel gets a post, and this is its private twin. Deliberately not sent on
resume or repost: a poster toggling pause would otherwise re-DM everyone watching.

The message is the offer as `renderOffer` writes it, in the recipient's stored locale, with
`[Take]` (the same `take:<id>` callback as a `/board` card) and `[Pause these alerts]`. The pause
button keeps the tapped message's other buttons (`refreshed` in `bot.ts`), so silencing the pair
never costs you the offer that came in.

## Where it lives

```
packages/shared/src/alert.ts           AlertInput, matchesAlert, alert:<button>:<id> callbacks
apps/bot/src/features/alerts/
  service.ts                           list/save/pause/resume/delete + matchingAlerts
  api.ts                               the three routes above
  bot.ts                               /alerts, the cards, the buttons (also those on a DM)
  wizard.ts                            [+ Add a pair]
  notify.ts                            the DM, called by offers/service.ts createOffer
apps/webapp/src/entities/alert/        api.ts (Query hooks), model.ts
apps/webapp/src/pages/alerts/          AlertsPage: the list and the add form
apps/webapp/src/widgets/nav/NavTabs.tsx    the three top-level screens, now three tabs
apps/webapp/src/shared/ui/Pickers.tsx      Chips + MethodList, shared with the offer form
```

## Not done

- **Notifying on resume/repost.** See above; if thin-market offers turn out to live mostly as
  pause/resume, the trigger becomes "went active" with a per-alert cooldown, not a second call site.
- **A pair with "any" on one side** ("anything for RUB"). The pair is the alert's key; a nullable
  side would change the unique index and the matching query.
- **Digests / rate thresholds** ("only above 95"). One DM per matching offer is the whole policy.
