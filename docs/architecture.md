# Architecture

Status: **agreed 2026-09-12, skeleton implemented, no features yet.** The product spec is
[spec.md](spec.md) (+ [screenshots/](screenshots/));
this document is about _how_ we build it and _why_ it is shaped this way. Update the
**Decisions log** whenever a decision here changes.

## 1. Goals and constraints

- Three surfaces (bot chat, Mini App, channel) over one source of truth; the bot and the Mini
  App must not drift apart in behaviour or wording.
- Small community (hundreds of users, not millions). Start on SQLite; keep a credible path to
  Postgres if it grows. One VPS.
- Many short development sessions by different agents → documentation is a first-class deliverable.
- Hard requirements from the owner: TypeScript, grammY, Vite for the web app, Feature-Sliced
  Design for the web app, latest Node (native TS, `node:sqlite`), Oxlint + Oxfmt, pnpm.
- Style: the laziest correct solution. No speculative abstractions; delete before adding.

## 2. Stack

| Concern        | Choice                                                                                                                            | Why (and what was rejected)                                                                                                                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime        | Node 24, TypeScript run natively, `pnpm` workspaces                                                                               | No build step for the backend; `tsc --noEmit` for types only. Turbo/Nx rejected: three packages don't need a task graph.                                                                                                                                |
| Bot            | grammY 1.x, long polling                                                                                                          | Owner requirement. Long polling needs no public URL; switching to webhooks is a few lines once Caddy exists.                                                                                                                                            |
| HTTP API       | Hono + `@hono/node-server`                                                                                                        | Tiny, typed routes; `hc<Api>()` gives the Mini App an end-to-end typed client for free. Also serves the built Mini App (static + SPA fallback) so production is one process. tRPC rejected as heavier for the same benefit; Express rejected (untyped). |
| Database       | `node:sqlite` + Drizzle ORM **1.0 RC**                                                                                            | Owner wants the built-in driver; Drizzle's `node-sqlite` driver ships only in the 1.0 line. Drizzle gives typed queries + migrations + a dialect switch for Postgres. No repository layer on top — Drizzle _is_ the abstraction.                        |
| Mini App       | Vite, React 19, `@telegram-apps/telegram-ui`, `@telegram-apps/sdk-react`                                                          | Telegram-native look with theme variables; React because TelegramUI and FSD are React-centric.                                                                                                                                                          |
| Routing / data | TanStack Router (code-based routes) + TanStack Query, added with the first screens                                                | Typed params for deep links (`offer_1042`). **Not TanStack Start**: SSR is pointless inside a Telegram webview and its server functions would pull the API out of the bot process.                                                                      |
| i18n           | Fluent `.ftl` files in `packages/shared/locales`; `@grammyjs/i18n` in the bot, `@fluent/bundle` + `@fluent/react` in the Mini App | One catalog for both surfaces (en/ru/ar). Fluent handles Russian/Arabic plurals properly. A parity test keeps the three files in sync.                                                                                                                  |
| Validation     | zod 4                                                                                                                             | Env config, API input; schemas can live in `packages/shared` and be reused by Mini App forms.                                                                                                                                                           |
| Lint / format  | Oxlint, Oxfmt                                                                                                                     | Owner preference; one fast tool each.                                                                                                                                                                                                                   |
| Tests          | `node:test`                                                                                                                       | Zero dependencies. Vitest only if component tests are ever needed.                                                                                                                                                                                      |

## 3. Repository layout

```
apps/bot/            ONE Node process: grammY bot + Hono API + Drizzle/SQLite + in-process scheduler
apps/webapp/         Telegram Mini App (Vite + React + TelegramUI), Feature-Sliced Design
packages/shared/     Isomorphic: currencies/methods config, money math, statuses, locales, (later) zod schemas and deep-link ids
docs/                this file, spec.md, screenshots/, features/<name>.md
```

**Why the bot and the API are one process:** both need the same services and the same
database, and SQLite is a file — a second process would need to share it. It also makes the
"bot notification after an API call" path a plain function call (a Mini App request that creates
a claim calls the same service that then DMs the poster via `bot.api`).

**Why `packages/shared` is isomorphic-only:** it is bundled into the Mini App by Vite. Anything
touching Node or the DOM lives in the respective app.

### Backend: vertical slices, not FSD layers

FSD is a frontend methodology; forcing its layers onto a bot is awkward. The backend uses
feature folders instead — the same _spirit_ (feature isolation), plainer shape:

```
apps/bot/src/features/offers/
  service.ts   business logic; the only place that writes offers; used by bot.ts and api.ts
  api.ts       Hono routes for the Mini App
  bot.ts       grammY Composer: commands, callbacks, notifications
  channel.ts   (offers only) rendering + syncing the channel post
```

Cross-cutting: `db/`, `bot/` (bot instance + plugins), `http/` (app + auth), `config.ts`, `main.ts`.

### Mini App: Feature-Sliced Design

`app/` (init, providers, router) → `pages/` (browse, offer, take, create, my-offers) →
`widgets/` (offer card, claim status card) → `features/` (take-offer, create-offer, …) →
`entities/` (offer, claim: types, API hooks, formatting) → `shared/` (api client, i18n, ui bits).
Import only downward. Only create a layer when something goes in it.

Routing: TanStack Router with **code-based** routes in `app/router.tsx` (file-based routing would
fight FSD's `pages/` layer), memory history seeded from Telegram's `start_param`
(`offer_1042` → `/offers/1042`, `take_1042` → `/offers/1042/take`). Server state via TanStack Query.

## 4. Sharing between bot and Mini App — what is shared and what is not

**Shared (in `packages/shared`):** currency and payment-method config; rate-base order and money
math; offer/claim statuses; `availability()` (the single definition of "available"); the Fluent
catalog; and, as features land, zod schemas for inputs (create offer, take offer) and the
callback-data / deep-link identifiers (`offer_1042`, `take_1042`).

**Not shared: rendering.** Inline keyboards are a turn-based message protocol with 64-byte
callback payloads; React is a live view. A layer that rendered both would be larger than the two
UIs and would constrain each to the other's weakest feature. Instead drift is prevented by:

1. the shared vocabulary above (both surfaces can only express the same states and strings), and
2. `docs/features/<name>.md` listing, side by side, a feature's bot entry points, Mini App
   screens, API routes and channel-post effect. An agent editing one sees the other.

## 5. Data model and conventions

Schema: `apps/bot/src/db/schema.ts` (users, offers, claims, sessions). Mirrors the spec's
domain model. Conventions:

- **Money:** integer minor units (×100) in the DB, API, bot and Mini App state. Decimal only at
  input/display. `rate` is a REAL, always "1 base = rate quote" with base = `rateBase(give, get)`
  (fixed order USDT, USD, EUR, AED, RUB, EGP). `rate = null` ⇒ open/negotiable.
- **Derived, never stored:** `filled`, `reserved`, `requested`, `remaining` come from
  `availability(offer.giveAmount, claims)`. `deals` (reputation) = count of `done` claims as
  poster or taker.
- **Time:** epoch-ms integer columns (`timestamp_ms`). Display in `Europe/Moscow` (channel posts
  are static text, so they show absolute times).
- **Ids:** offers use the autoincrement id as the public `#1042`.
- **Config in code, not tables:** currencies/methods, expiry options, note length live in
  `packages/shared/src/currencies.ts`. There is no admin UI, so a table would be pure overhead.
- **Sessions:** grammY session (and later conversations) state in the `sessions` key-value table.
- **Column names** are camelCase as in the TS schema; Drizzle quotes identifiers, so this is portable.

### Postgres path

Keep every query in the Drizzle query builder (no raw SQL, no SQLite-only functions). Moving =
change `sqlite-core` → `pg-core` imports and column types in `schema.ts`, swap the driver in
`db/index.ts`, regenerate migrations. The `sessions` table and JSON-in-text columns map to
`jsonb` trivially. **Telegram user ids need `bigint({ mode: 'number' })` on Postgres** — they exceed
32 bits (SQLite's INTEGER is 64-bit, so `integer()` is fine there). Nothing else in the codebase
knows which database it talks to.

## 6. Runtime model

- `main.ts`: load config → open DB and apply migrations → build bot → build HTTP app → listen → poll.
- **Scheduler (to implement):** a `setInterval` (≈60 s) in the same process runs idempotent
  "due" queries: expire offers (`expiresAt <= now`), ping posters of no-expiry offers every 48 h
  and auto-pause after 24 h of silence, auto-decline pending requests older than 12 h and notify
  the taker. **No in-memory timers**: every tick asks the DB what is due, so a restart or deploy
  loses nothing — whatever became due while the process was down runs on the first tick.
  Deliberate ceiling: one process, one interval; a job queue only if we ever run more than one instance.
- **Channel sync (to implement):** `renderChannelPost(offer, claims)` is a pure function of DB
  state; `syncChannelPost(offerId)` is called after every state change and edits the post in
  place, or deletes it on complete / close / expire. No bumping (delete + resend) for now — add it
  if subscribers turn out to miss partially-filled offers. Per-offer serialisation and burst
  coalescing, plus `@grammyjs/auto-retry` for 429s. Bots may edit/delete their own channel posts
  without the 48 h limit.
- **Notifications** are sent from services via `bot.api` (not from `ctx`) so the Mini App path
  and the bot path share them.
- **Callback idempotency:** every callback is answered; stale Confirm/Decline/Done buttons on a
  closed claim answer "Already closed" and remove the keyboard.

## 7. API and auth

- Routes live under `/api`. Health is public; everything else sits behind `telegramAuth`, which
  expects `Authorization: tma <initData>` and verifies the HMAC-SHA256 signature with the bot
  token (`apps/bot/src/http/auth.ts`, ~20 lines of `node:crypto`, tested). Max age 1 h.
- Access: **open to anyone at first** (`MEMBER_CHATS` empty). Gating via `getChatMember` against
  `MEMBER_CHATS` is a later switch, not a redesign.
- The Mini App uses Hono's `hc<Api>()` client — types flow from the server routes; no OpenAPI, no codegen.
- Dev outside Telegram: `GET /api/dev/init-data` (mounted only when `NODE_ENV !== 'production'`)
  returns initData signed with the real bot token for a fixed fake user (id 1); the Mini App fetches
  it before `mockTelegramEnv()`. The verifier has no dev branch — the same path runs in both
  environments. The token never reaches the browser. Real-Telegram testing still works via a tunnel.

## 8. Development workflow

- `pnpm dev` runs the bot (`node --watch`, reads `apps/bot/.env`) and Vite (proxies `/api` → `:3000`).
- Schema change → edit `schema.ts` → `pnpm --filter @sarraf/bot db:generate` → commit `apps/bot/drizzle/`.
  Migrations apply on boot.
- New string → add to **all three** `.ftl` files (parity test) → `ctx.t()` / `<Localized>`.
- `pnpm check` before declaring anything done.
- Node native TS rules: `.ts` extensions on relative imports; no enums/namespaces/parameter properties.

## 9. Deployment (agreed shape, not built yet)

- One VPS. Docker in production; plain `node` locally.
- `bot` container: `node apps/bot/src/main.ts` with `apps/webapp/dist` built into the image;
  serves `/api` and the Mini App. SQLite file on a named volume, env via compose. Long polling →
  the only inbound traffic is from Caddy.
- `caddy` container: automatic TLS and a single `reverse_proxy bot:3000`.
- Names are never literals: bot username comes from `getMe` (`ctx.me` / `bot.botInfo`), the
  channel from `OFFERS_CHANNEL`, the display name from the locale catalog. The Mini App short name
  (for `t.me/<bot>/<short>?startapp=` links) becomes an env var when deep links land.
- Backups: nightly `sqlite3 .backup` (WAL-safe) of the volume to off-box storage.
- Telegram needs an HTTPS URL for the Mini App (`WEBAPP_URL`) and the bot must be admin of `OFFERS_CHANNEL`.

## 10. Decisions log

| Date       | Decision                                                                                     | Notes                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 2026-09-12 | TypeScript + grammY; Node 24 native TS; pnpm workspaces                                      | Owner requirements + zero build step                                                                              |
| 2026-09-12 | SQLite via `node:sqlite`, Drizzle **1.0 RC**                                                 | Stable 0.45 lacks the node-sqlite driver; alternatives were `better-sqlite3` (native build) or a community driver |
| 2026-09-12 | Drizzle `casing` option not used; camelCase columns                                          | RC removed the option; quoting makes camelCase portable                                                           |
| 2026-09-12 | Hono for the API, one process with the bot                                                   | See §3                                                                                                            |
| 2026-09-12 | Node serves the built Mini App too; Caddy is a single `reverse_proxy`                        | Owner: self-contained and close to dev (Vite proxy in dev gives the same one-origin shape)                        |
| 2026-09-12 | TanStack Router (code-based) + TanStack Query; **not** TanStack Start                        | See §2/§3                                                                                                         |
| 2026-09-12 | Channel posts: edit in place, no bump                                                        | Owner: whichever is simpler                                                                                       |
| 2026-09-12 | Access open at first; `MEMBER_CHATS` gating later                                            | Owner decision                                                                                                    |
| 2026-09-12 | Pending requests auto-declined after 12 h by the DB-driven scheduler                         | Owner: yes if straightforward — it is one more "due" query                                                        |
| 2026-09-12 | Handles/names from `getMe`, env and the locale catalog; never literals                       | Owner: placeholders must be easy to change                                                                        |
| 2026-09-12 | Mini app imports the API _type_ from `@sarraf/bot/api` (workspace dev-dependency, type-only) | One source of truth for routes and payloads; costs a slower webapp typecheck                                      |
| 2026-09-12 | Native Telegram main/back buttons, with in-page fallbacks when the env is mocked             | Keeps the Telegram-native feel without making browser dev unusable                                                |
| 2026-09-12 | Prototype files not kept; `docs/spec.md` + `docs/screenshots/` only                          | Superseded by `packages/shared` and the screenshots                                                               |
| 2026-09-12 | No shared bot/Mini-App renderer; share vocabulary + per-feature docs                         | See §4                                                                                                            |
| 2026-09-12 | Vertical slices in the backend, FSD in the Mini App                                          | FSD layers don't map to a bot                                                                                     |
| 2026-09-12 | Fluent (`@grammyjs/i18n`) for en/ru/ar, catalog in `packages/shared`                         | Owner choice; Arabic/Russian plurals                                                                              |
| 2026-09-12 | Oxlint + Oxfmt over Biome                                                                    | Owner preference                                                                                                  |
| 2026-09-12 | Currency/method config in code, not a table                                                  | No admin UI exists; revisit if non-developers must edit                                                           |
| 2026-09-12 | Money as integer minor units, rate as REAL                                                   | Display-only rate; exact amounts                                                                                  |
| 2026-09-12 | Deployment: VPS + Docker + Caddy, long polling                                               | Owner decision; Dockerfile/compose added at first deploy                                                          |

## 11. Roadmap (suggested order — dependency and value)

1. **Offers core** — `features/offers`: service (create/edit/pause/close with the
   `amount ≥ filled + reserved` rule), API, Mini App Browse / Offer / Create screens, TanStack
   Router + Query, typed `hc<Api>` client. Deep links `startapp=offer_<id>`.
2. **Channel sync** — render + edit/delete/bump, queue, auto-retry. The product's core promise.
3. **Claims handshake** — take (Mini App) → poster Confirm/Decline (bot) → two-sided Done →
   channel update; cancel/release; contact gating (username revealed only after confirm); idempotent stale buttons.
4. **Bot parity** — `/new` wizard via `@grammyjs/conversations`, `/mine`, reply keyboard, `/board`,
   and the take wizard from `?start=take_<id>` (same service as the Mini App take).
5. **Scheduler** — expiry, 48 h check-ins for no-expiry offers, auto-pause, 12 h pending auto-decline.
6. **Access & admin** — switch on `MEMBER_CHATS` gating, per-user rate limits, admin remove/ban.
7. **Deploy** — Dockerfile, compose (bot + Caddy), backups. Then webhooks if desired.

## 12. Questions — resolved 2026-09-12

1. Access: open to everyone at first; `MEMBER_CHATS` gating later.
2. Unanswered pending requests: auto-decline after 12 h (scheduler, DB-driven, restart-safe).
3. Partial fill: edit the channel post in place; no bumping.
4. `@innoexchange_bot` / `@innoexchange` stay as placeholders, sourced from `getMe` / env — never literals.
5. Take from the channel: Mini App first (one implementation to ship the loop); the bot-chat take
   wizard joins the bot-parity phase, reusing the same service. Nothing is wrong with the bot flow —
   it is a second implementation of the same form, so it follows rather than leads.
6. `deals` reputation: shown (spec default); keep a single constant to hide it.

Currently open: none.
