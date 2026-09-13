> Handoff from Claude Design (project: https://claude.ai/design/p/4cea067d-597f-44f1-b5f6-69082216f302).
> Only this spec and `screenshots/` were kept in the repo; the clickable HTML prototype and its
> data file mentioned below live in that project. The domain model and seed data from
> `exchange-data.js` are now `packages/shared/src/`.

# Handoff: InnoExchange — Telegram bot + mini app for community currency swaps

## Overview

InnoExchange lets members of a trusted community (Arabic-speaking residents of Innopolis, Russia; English UI for now) post offers to exchange currency between individuals. The bot is a **notice board, not a middleman**: it never holds funds, never escrows, and does not anonymise anyone. Its job is to (1) make posting structured, (2) tell people whether an offer is _actually still available_ before they DM the poster, (3) keep one channel post per offer permanently in sync with the offer's state, and (4) support partial fills by multiple takers.

Product names: bot display name **InnoExchange**, bot username **@innoexchange_bot**, offers channel **@innoexchange** (placeholder — adjust).

## About the design files

`InnoExchange.dc.html` (+ `exchange-data.js`, `android-frame.jsx`, `support.js`) is a **design reference built in HTML**, not production code. Open `InnoExchange.dc.html` in a browser to run the clickable prototype: three phones share one in-memory state — Nour's mini app (taker), Alex's bot chat (poster), and the channel. Recreate the _behaviour and UI_ in the real stack (Telegram Bot API + a Telegram Mini App web front-end + a backend with a database); do not ship the HTML.

`exchange-data.js` is worth reading: it holds the domain model, rate maths, and all seed data.

## Fidelity

**High-fidelity for UX/flows and copy; medium-fidelity for pixels.** Telegram renders the bot side (messages, inline keyboards, reply keyboards) itself, so those must be recreated with the Bot API, not styled. The mini app must use Telegram's own `themeParams` CSS variables (listed below) so it matches every user's theme; sizes/spacing in the prototype are Android-Telegram-like and should be followed closely, but the theme colours come from Telegram at runtime, never hard-coded.

---

## Domain model

```
Offer {
  id                 int, sequential, shown publicly as #1042
  poster             Telegram user (id, username, first_name)
  give               { cur: 'USDT'|'RUB'|'EGP'|'USD'|'EUR'|'AED', amount: decimal, methods: string[] }
  get                { cur, methods: string[] }          // get.cur ≠ give.cur
  rate               decimal | null                       // expressed as 1 BASE = rate QUOTE (see Rate)
  negotiable         bool                                  // true ⇒ rate (if any) is an *asking* rate
  note               string ≤ 200 chars, optional
  expiresAt          datetime | null                       // null = no expiry (see Expiry)
  status             'active' | 'paused' | 'completed' | 'closed' | 'expired'
  channelMessageId   int (the one post that gets edited/deleted/bumped)
  claims             Claim[]
}
Claim {
  id, offerId, taker (Telegram user), amount (in give.cur), method (one of offer.get.methods)
  status   'pending' | 'confirmed' | 'done' | 'declined' | 'cancelled'
  takerDone bool, posterDone bool     // status becomes 'done' only when both are true
}
```

Currencies and methods (methods depend on the currency; make this a config table, not code):

- USDT — networks: TRC20, TON, BEP20, ERC20
- RUB — SBP, Tinkoff, Sber, Cash
- EGP — InstaPay, Vodafone Cash, Cash
- USD — Cash, Wise, Zelle
- EUR — Cash, SEPA, Revolut
- AED — Cash, Bank transfer

Derived quantities (from `exchange-data.js`):

- `filled   = Σ claims.done.amount`
- `reserved = Σ claims.confirmed.amount`
- `requested = Σ claims.pending.amount` (informational only)
- `remaining = give.amount − filled − reserved` ← the only number that means "available"

**Pending requests reserve nothing.** They are displayed ("100 USDT requested") so takers see contention, but availability only drops when the poster confirms.

### Rate

The rate is always written with the "stronger" currency as base, using the fixed order `USDT, USD, EUR, AED, RUB, EGP` (earlier = base). So Alex's USDT→RUB offer and Marina's RUB→USDT offer both read `1 USDT = 96.5 RUB`. Conversions: if `give.cur` is the base, `total = amount × rate`, else `total = amount ÷ rate`.

Three rate states:

- fixed: `rate` set, `negotiable=false` → "1 USDT = 96.5 RUB", taker sees exactly what they pay
- asking: `rate` set, `negotiable=true` → "Asking 1 USDT ≈ 96.5 RUB · negotiable"
- open: `rate=null` (implies negotiable) → "Rate negotiable"

### Expiry

Options on create: 6h / 12h / 24h / 48h / None. Channel posts are static text, so they show an **absolute time** ("expires today 20:00", "expires tomorrow 06:00", "expires Sat 14:00", "no expiry") in the community's timezone (Europe/Moscow). The mini app may show relative "5h left" because it renders live.

- Expired offers: status → `expired`, channel post deleted, poster notified with a one-tap "Repost" button.
- **No expiry** offers: a scheduled job DMs the poster every 48h ("Is #1042 still on?" [Yes] [Pause] [Close]); no answer within 24h ⇒ auto-pause (post edited to "Paused"). This mitigation is what makes "no expiry" acceptable — stale offers are the core problem the product solves.

---

## Surfaces & screens

### A. Mini app (`@innoexchange_bot/app`)

Use the Telegram WebApp SDK: `themeParams` → CSS vars, `MainButton` for the primary action on every screen, `BackButton` on sub-screens, `HapticFeedback` on confirm/decline, validate `initData` server-side, handle `start_param` deep links (`offer_1042`, `take_1042`).

1. **Browse** (home). Segmented control "Offers | My offers" at top. Section header "I'M LOOKING FOR" + horizontal chips: Anything, USDT, USD, EUR, AED, RUB, EGP (filters by `give.cur`). List rows (avatar initial, "200 USDT → RUB", rate line, methods line, then a status line): availability in green ("200 USDT available") or amber ("120 of 300 USDT left"), plus amber "100 USDT requested/reserved" when applicable, poster name + deals count, "Nh left" right-aligned. Only `active` offers: paused (and completed/closed/expired) ones appear in My offers, not on the board — nothing on the board is untakeable. Footer hint: "Amounts marked 'requested' aren't reserved yet — the poster still has to confirm." MainButton: **POST AN OFFER**.
2. **Offer detail**. Centered header: avatar, "Alex · 14 deals", big `200 USDT → 19,300 RUB` (or "RUB · negotiable"), rate in accent colour, progress bar (grey = filled, amber 50% = reserved), "N available" / "expires…". If the viewer has an active claim, a status card: amber dot "Waiting for Alex to confirm" with "Cancel request"; green dot "Alex confirmed — it's yours" with **Message Alex** + **Mark as done** and "Release my reservation"; "You marked done · waiting for Alex"; "Deal completed". Sections: DETAILS (gives / accepts as chips, "Expiry: …"; partial fills are always allowed, so the page doesn't state it as if it were a per-offer setting), NOTE FROM ALEX (if any), OTHER TAKERS (name + "180 USDT · done/reserved/requested"). MainButton: **TAKE THIS OFFER** (hidden/disabled when own offer, paused, remaining = 0, or viewer already has a non-done claim).
3. **Take**. Big numeric input with currency suffix, "Max 200 USDT", red "More than available" when exceeded, quick chips (50 / 100 / All 200), computed "You pay 9,650 RUB" (or "Rate to be agreed with Alex"), radio list "YOU'LL PAY WITH" from `offer.get.methods`, hint about confirmation. MainButton: **REQUEST 100 USDT** (disabled until valid). On submit → back to detail with the pending card and a toast.
4. **Create / Edit**. Sections: YOU GIVE (currency chips, amount input, method multi-select labelled "Network" for USDT else "Payment method"), YOU GET (currency chips **excluding the give currency**, methods), RATE / ASKING RATE · OPTIONAL (`1 USDT = ___ RUB`, Negotiable toggle with hint, live total), EXPIRES AFTER (6h/12h/24h/48h/None + hint sentence), NOTES · OPTIONAL (≤200, counter). MainButton **POST OFFER** / **SAVE CHANGES**, enabled only when amount > 0, ≥1 method each side, and (negotiable OR rate > 0). Edit constraint (not in prototype, must implement): amount cannot be set below `filled + reserved`.
5. **My offers**. POSTED BY YOU: each offer card with claims underneath (Karim · 200 AED via Cash · "asks if available" → **Confirm** / Decline; confirmed → **Done**), footer actions Pause/Resume · Edit · Close. YOUR REQUESTS: rows linking to the offer with status ("waiting for confirmation", "confirmed — message Alex", "completed", "declined").

### B. Bot chat (poster & taker both get these)

- `/start` → welcome + persistent **reply keyboard**: [Browse offers] [New offer] / [My offers] [Help]; plus an inline `web_app` button "Open InnoExchange".
- `/new` (or "New offer") → step-by-step with inline keyboards, one question per message: give currency → typed amount (validate number) → methods multi-select (buttons toggle "✓ TRC20", footer "Done (n)"; edit the same message via `editMessageReplyMarkup`) → get currency (excluding give) → methods → rate (typed number, or button "Negotiable, no rate"; if typed, ask "Fixed / Asking · negotiable") → expiry (6h/12h/24h/48h / No expiry) → notes (typed or Skip) → preview card with [Post to channel] / [Start over] [Cancel].
- `/mine` → one card per offer with [Edit] [Pause] [Close]; requests listed similarly.
- `/board` → opens the mini app.
- **Handshake notifications** (this is the core loop):
  - to poster on new request: "Nour wants to take 100 USDT of your offer #1042 (100 USDT → 9,650 RUB via SBP). Is it still available?" [Confirm] [Decline]
  - after Confirm the same message is edited to keep [Message Nour] / [Mark as done] [Release]; taker is notified "Alex confirmed — you can message @alex now" with a Message button.
  - after Decline: message edited to "Declined — amount released"; taker notified.
  - Done is two-sided: when one side taps Done the other gets "Nour marked #1042 (100 USDT) as done. Confirm on your side to update the post." [Done on my side too] [Not yet]. When both → claim `done`, remaining recalculated, channel updated, both get a summary.
  - Stale buttons must be idempotent: once a claim is done/declined/cancelled, taps on old Confirm/Decline/Done/Release answer the callback with "Already closed" and remove the keyboard. Every callback must be answered (`answerCallbackQuery`).
- Contact gating: the taker's "Message poster" (and the poster's username/`tg://user?id=`) is only revealed **after confirmation**. This is the mechanism that stops people texting about gone offers.

### C. Channel (`@innoexchange`)

One post per offer, created by the bot, **edited on every state change**:

```
Alex gives 200 USDT for RUB
1 USDT = 96.5 RUB  ≈ 19,300 RUB
USDT: TRC20
RUB: SBP, Tinkoff
<note, italic, if any>
● Active — 200 USDT available            (green dot)
● Partially filled — 100 USDT left       (amber)  + "100 USDT reserved" / "100 USDT requested, awaiting confirmation"
● Paused                                 (grey)
#1042 · Alex, 14 deals · expires today 20:00
[Take] [Open in InnoExchange]
```

- **Buttons**: channel posts cannot carry `web_app` buttons, so both must be `url` deep links: Take → `https://t.me/innoexchange_bot/app?startapp=take_1042` (or `https://t.me/innoexchange_bot?start=take_1042` for the bot flow); Open → `…?startapp=offer_1042`. Hide Take when remaining = 0 or paused.
- **Partial fill ⇒ bump**: delete the old post and send a fresh one (so it appears at the bottom, re-notifying subscribers); update `channelMessageId`. (Alternative if bumps get noisy: edit in place only, bump at most once per 6h.)
- **Completion / close / expiry ⇒ delete** the post. Bots can edit and delete their own channel messages without the 48h limit.
- Bumping/editing must be rate-limit aware (queue edits, coalesce bursts).

---

## Business rules checklist

- No escrow, no fund handling, no anonymity; identities are Telegram accounts.
- Access: only community members may post/take. Suggested: gate on `getChatMember` of the existing shared group(s) (**open question — confirm which groups**).
- Multiple takers at once; each pending request is independent; poster confirms each. Confirming more than `remaining` must be blocked ("only 50 USDT left").
- Poster can pause/resume, edit (amount ≥ filled+reserved; edited post gets "edited" and the channel post is re-rendered), and close (post deleted; pending requests declined with notification; confirmed ones remain until done/released).
- Taker can cancel a pending request or release a confirmed reservation.
- Reputation: `deals` = count of `done` claims as poster or taker; shown as "14 deals" everywhere (a `showDeals` flag exists — keep it configurable).
- Poster cannot take their own offer.
- Currency list, methods, expiry options, note length are config.

## Design tokens (mini app)

Use Telegram's theme variables exactly — never hard-code colours except the two status hues:
`--tg-theme-bg-color, --tg-theme-secondary-bg-color, --tg-theme-text-color, --tg-theme-hint-color, --tg-theme-link-color, --tg-theme-button-color, --tg-theme-button-text-color, --tg-theme-header-bg-color, --tg-theme-accent-text-color, --tg-theme-section-bg-color, --tg-theme-section-header-text-color, --tg-theme-subtitle-text-color, --tg-theme-destructive-text-color, --tg-theme-section-separator-color, --tg-theme-bottom-bar-bg-color`.
Status colours: available/confirmed green `#2e9e4b` (dark `#4fbf6d`), partial/pending amber `#d98a00` (dark `#f0a72b`).
Type: platform font (Roboto on Android). Sizes used: header title 20/500, screen big number 26–34/500, list title 16/500, body 15, secondary 14, meta 13, hint 12–13. Section headers 13/500 uppercase in `section-header-text-color`. Radii: list rows 0, cards 12, chips 18 (pill), buttons 8–10. MainButton 48px tall, uppercase 15/500.

## Not covered by the prototype (decide during implementation)

- Localisation (RU/AR incl. RTL) — copy is English only.
- Admin tooling (remove abusive posts, ban), spam/rate limits per user.
- Editing a channel post after Telegram's message-edit rate limits; retry/queue.
- What happens if a poster never responds to a request (suggest: auto-expire pending requests after 12h and tell the taker).
- Persistence/hosting stack (any is fine: e.g. Python aiogram or Node grammY, Postgres, a small React/Vue mini app served over HTTPS).

## Screenshots

`screenshots/` — 11 frames of the prototype, each showing all three surfaces (mini app · bot chat · channel) at the same moment, numbered in flow order: browse → detail → take → request pending (poster notified) → poster confirmed (reserved) → taker done → both done (post bumped, "100 USDT left") → create form (top / negotiable + no-expiry + notes) → My offers (poster confirming Karim) → bot step-by-step new offer.

## Files

- `InnoExchange.dc.html` — the clickable prototype (open in a browser; three phones, shared state)
- `exchange-data.js` — domain model, rate/expiry helpers, seed offers
- `android-frame.jsx`, `support.js` — prototype scaffolding only
