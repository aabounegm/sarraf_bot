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
  wizard.ts    the conversation (step-by-step questions) the commands enter
  render.ts    the offer as text, for the channel post and the bot's cards alike
  channel.ts   (offers only) syncing that text with the one channel post
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

- `main.ts`: load config → open DB and apply migrations → build bot → build HTTP app → `getMe` and
  wire the channel queue → listen → poll (or register the webhook).
- **Scheduler** (`scheduler.ts`, done 2026-09-14): `runDueWork(db, now)` is a plain function of the
  database and a clock — expire offers (`expiresAt <= now`), auto-decline pending requests older
  than 12 h, auto-pause a no-expiry offer 24 h after an unanswered check-in, and ping the poster of
  one every 48 h. `startScheduler(db)` (wired in `main.ts`, like the channel queue) runs it once at
  boot and then every 60 s with `Date.now()`; tests call it directly with a time of their choosing,
  so nothing waits on a timer. **No in-memory timers and no in-memory state**: every tick asks the
  DB what is due and every job's own effect takes the row out of its own query, so a restart or a
  deploy loses nothing and repeats nothing. The jobs never write offers or claims themselves —
  they call `applyOfferAction` / `applyClaimAction` in the poster's name, which is what makes the
  channel post and the DMs identical to a human tap. Deliberate ceiling: one process, one interval;
  a job queue only if we ever run more than one instance.
- **Channel sync** (`features/offers/channel.ts`): `renderOffer(offer)` is a pure function of DB
  state; `queueChannelSync(offerId)` runs at the end of every offer mutation and edits the post in
  place, or deletes it on complete / close / expire. No bumping (delete + resend) for now — add it
  if subscribers turn out to miss partially-filled offers. One promise chain drains the queue, so
  calls are serialised; a second change to the same offer while it is still queued is coalesced
  into one render. 429 retries use Telegram's own `retry_after` (three attempts) rather than
  `@grammyjs/auto-retry`. Bots may edit/delete their own channel posts without the 48 h limit.
  Known ceiling: the queue is in memory, so a crash between the commit and the API call leaves the
  post stale until the offer changes again.
- **Notifications** are sent from services via `bot.api` (not from `ctx`) so the Mini App path and
  the bot path share them: `features/claims/notify.ts`, on the same fire-and-forget queue helper as
  the channel post (`lib/telegram-queue.ts`).
- **Callback idempotency:** every callback is answered; stale Confirm/Decline/Done buttons on a
  closed claim answer "Already closed" and remove the keyboard. A catch-all at the end of the
  middleware stack answers anything nobody claimed.
- **Wizards** (`@grammyjs/conversations` v2) are entered from commands and buttons and keep their
  replay state in the `sessions` table under a `conversation-` prefix. They never touch the
  database except through `conversation.external`, and they hand commands, reply-keyboard buttons
  and other features' callbacks back to the middleware instead of swallowing them. See
  [features/bot.md](features/bot.md).

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

## 9. Deployment

Runbook: [deployment.md](deployment.md). The shape:

- **One bot = one origin** (`innoexchange.bots.abounegm.com`): mini app at `/`, API at `/api`,
  webhook at `/webhook`, all from one container. Subdomain rather than `bots.abounegm.com/<bot>`:
  the mini app's absolute URLs (Vite `base`, `/api`, deep links) then need no path configuration,
  dev (`localhost:5173/`) and prod have the same shape, and each bot gets its own browser origin.
  DNS: a DNS-only (unproxied) `*.bots.abounegm.com` wildcard — Cloudflare's free edge certificate
  cannot cover two-label names, so these hosts bypass the proxy and Caddy terminates TLS itself.
- The host's existing Caddy terminates TLS with one `reverse_proxy 127.0.0.1:<port>` block per bot;
  the compose file publishes the port on loopback only. No Caddy container.
- `BOT_MODE=webhook` in production: boot calls `setWebhook(PUBLIC_URL/webhook, secret_token)`;
  the secret is `sha256(BOT_TOKEN)`, so it needs no separate configuration and anyone who could
  forge it already has the token. Development polls (`bot.start()` also deletes any webhook).
- `PUBLIC_URL` is the one URL: the "Open InnoExchange" button, the webhook, and (in dev) the tunnel.
- SQLite on a named volume; backups via `node:sqlite`'s `backup()` (WAL-safe).
- Names are never literals: bot username comes from `getMe` (`ctx.me` / `bot.botInfo`), the
  channel from `OFFERS_CHANNEL`, the display name from the locale catalog. Mini-app deep links use
  the bot's **main** Mini App (`t.me/<bot>?startapp=`), so there is no short name to configure.

## 10. Decisions log

| Date       | Decision                                                                                         | Notes                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 2026-09-12 | TypeScript + grammY; Node 24 native TS; pnpm workspaces                                          | Owner requirements + zero build step                                                                                   |
| 2026-09-12 | SQLite via `node:sqlite`, Drizzle **1.0 RC**                                                     | Stable 0.45 lacks the node-sqlite driver; alternatives were `better-sqlite3` (native build) or a community driver      |
| 2026-09-12 | Drizzle `casing` option not used; camelCase columns                                              | RC removed the option; quoting makes camelCase portable                                                                |
| 2026-09-12 | Hono for the API, one process with the bot                                                       | See §3                                                                                                                 |
| 2026-09-12 | Node serves the built Mini App too; Caddy is a single `reverse_proxy`                            | Owner: self-contained and close to dev (Vite proxy in dev gives the same one-origin shape)                             |
| 2026-09-12 | TanStack Router (code-based) + TanStack Query; **not** TanStack Start                            | See §2/§3                                                                                                              |
| 2026-09-12 | Channel posts: edit in place, no bump                                                            | Owner: whichever is simpler                                                                                            |
| 2026-09-12 | Access open at first; `MEMBER_CHATS` gating later                                                | Owner decision                                                                                                         |
| 2026-09-12 | Pending requests auto-declined after 12 h by the DB-driven scheduler                             | Owner: yes if straightforward — it is one more "due" query                                                             |
| 2026-09-12 | Handles/names from `getMe`, env and the locale catalog; never literals                           | Owner: placeholders must be easy to change                                                                             |
| 2026-09-12 | Mini app imports the API _type_ from `@sarraf/bot/api` (workspace dev-dependency, type-only)     | One source of truth for routes and payloads; costs a slower webapp typecheck                                           |
| 2026-09-12 | Native Telegram main/back buttons, with in-page fallbacks when the env is mocked                 | Keeps the Telegram-native feel without making browser dev unusable                                                     |
| 2026-09-12 | Prototype files not kept; `docs/spec.md` + `docs/screenshots/` only                              | Superseded by `packages/shared` and the screenshots                                                                    |
| 2026-09-12 | No shared bot/Mini-App renderer; share vocabulary + per-feature docs                             | See §4                                                                                                                 |
| 2026-09-12 | Vertical slices in the backend, FSD in the Mini App                                              | FSD layers don't map to a bot                                                                                          |
| 2026-09-12 | Fluent (`@grammyjs/i18n`) for en/ru/ar, catalog in `packages/shared`                             | Owner choice; Arabic/Russian plurals                                                                                   |
| 2026-09-12 | Oxlint + Oxfmt over Biome                                                                        | Owner preference                                                                                                       |
| 2026-09-12 | Currency/method config in code, not a table                                                      | No admin UI exists; revisit if non-developers must edit                                                                |
| 2026-09-12 | Money as integer minor units, rate as REAL                                                       | Display-only rate; exact amounts                                                                                       |
| 2026-09-12 | Deployment: VPS + Docker + Caddy                                                                 | Owner decision                                                                                                         |
| 2026-09-13 | Subdomain per bot (`<bot>.bots.abounegm.com`); TMA + API + webhook on that one origin            | Owner decision after weighing paths vs subdomains (§9)                                                                 |
| 2026-09-13 | Webhook in production, polling in dev; secret derived from the bot token                         | One `PUBLIC_URL`; no extra secret to manage                                                                            |
| 2026-09-13 | Bot-only container; the host's existing Caddy proxies to a loopback port                         | Owner already runs Caddy on the VPS                                                                                    |
| 2026-09-13 | Channel posts are English only (`i18n.t('en', …)`)                                               | One post, one mixed-language audience; per-poster locales would make the channel a language soup                       |
| 2026-09-13 | Channel sync is an in-process promise queue keyed by offer id, wired at boot                     | One process owns the channel; a DB-backed outbox buys durability the product does not need yet                         |
| 2026-09-13 | Paused offers leave the browse list (they stay in My offers and keep their post)                 | Owner: nothing on the board should be untakeable                                                                       |
| 2026-09-13 | Handles are only in `getOffer(…, viewerId)` / `listClaimsByTaker`, never in list payloads        | Contact gating has to hold in the payload, not only in the UI — the mini app is a client                               |
| 2026-09-13 | A release is recorded as `declined` by the poster, `cancelled` by the taker                      | Same effect on availability; the taker's list should say honestly which happened                                       |
| 2026-09-13 | Claim routes answer with the whole `OfferDetail`                                                 | One response refreshes the claim, the availability and the other takers; no second round trip                          |
| 2026-09-13 | `/api/dev/init-data?user=2` issues a second fake identity in development                         | A two-sided handshake cannot be tested from one browser profile otherwise                                              |
| 2026-09-13 | One claim DM to the poster (`claims.posterMessageId`), re-rendered like the channel post         | Confirming in the mini app has to disarm the bot's buttons; two surfaces, one message to keep honest                   |
| 2026-09-13 | Stale claim buttons answer "Already closed" instead of acting                                    | The service refuses the transition anyway; the callback just reports it (spec § idempotency)                           |
| 2026-09-13 | Notifications render in the recipient's stored `users.locale`, not the actor's                   | There is no `ctx` when the mini app triggers the DM                                                                    |
| 2026-09-14 | Bot wizards use `@grammyjs/conversations` v2, state in the `sessions` table (`conversation-`)    | Owner's plan; the alternative was a hand-rolled step machine in the session                                            |
| 2026-09-14 | A wizard halts on a command or a menu button and skips foreign callbacks, both with `next: true` | Otherwise a half-finished `/new` silently eats `/mine` and every claim button in the chat                              |
| 2026-09-14 | `/start` carries the reply keyboard only; `[Browse offers]` is a `web_app` keyboard button       | One message carries one markup, and the keyboard already opens the app; the inline button moved to `/board`            |
| 2026-09-14 | One offer renderer for the channel post and the bot cards, parameterised by the translator       | They are the same text in two languages: the channel stays English, the chat uses `ctx.t`                              |
| 2026-09-14 | The poster answers requests on the claim DM; `/mine` cards list them as text                     | That DM is already re-rendered from every surface — a second set of buttons would be a second truth                    |
| 2026-09-14 | `/mine` shows only active and paused offers and open requests                                    | The chat carries what you can act on; history is what the mini app is for                                              |
| 2026-09-14 | `[Close]` in the chat asks before it closes (`offer:close` → `closenow` / `keep`)                | Closing deletes the post and declines pending requests; the mini app confirms too                                      |
| 2026-09-14 | Wizard step buttons carry no id and live in `bot/wizard.ts`, not in `packages/shared`            | They last as long as one question, are read three lines from where they are built, and are bot-only                    |
| 2026-09-15 | `setMyCommands` at boot (private chats, one call per locale); `/help` prints the same list       | Two hand-kept lists of the same five commands would drift; `/start` stays out — the client already offers it           |
| 2026-09-15 | The chat menu button is the mini app (English label), not the commands list                      | Commands stay on typing `/`; the profile's "Open App" is BotFather-only, not an API call                               |
| 2026-09-15 | Deep links are the **main** Mini App's (`t.me/<bot>?startapp=`), not a named app's `/<short>/`   | A named app is a separate BotFather object; with only the main one enabled, `/app/` links silently opened the chat     |
| 2026-09-14 | Tests record Telegram at the `fetch` level (`createBot(config, db, client)`)                     | A conversation builds its own `Api`, so a transformer on `bot.api` never sees what a wizard sends                      |
| 2026-09-14 | The scheduler is `runDueWork(db, now)` plus a 60 s interval; its jobs go through the services    | The clock is an argument, so tests drive it; the services keep the post, the DMs and the rules in one place            |
| 2026-09-14 | System actions (`expire`, `repost`, `checkin`, claim `timeout`) act as the poster, off the API   | The scheduler needs an actor and the poster owns the offer; no route may impersonate that                              |
| 2026-09-14 | `[Repost]` revives the same offer with a fresh 24 h expiry rather than copying it to a new id    | Owner: the id is public and the claim history is real — only the post was deleted. The old duration is not stored      |
| 2026-09-14 | One nullable `offers.checkInAt` ("asked, waiting"); `updatedAt` is "last heard from the poster"  | Owner: one column, one migration. Every poster action clears it and so bumps `updatedAt`, restarting the 48 h          |
| 2026-09-14 | Closing or expiring an offer declines its pending claims through `applyClaimAction`              | The bulk `UPDATE` it replaces left those takers waiting for an answer that had already been given                      |
| 2026-09-15 | `/board` is the board in the chat: one offer per screen, one message edited in place             | A card per offer floods the chat and cannot be filtered; the mini app keeps the list view                              |
| 2026-09-15 | The board's whole state is its callback data (`board:<any\|CUR>:<index>`), the list re-read      | No session or cursor table to keep honest, and an old board message still works — at the cost of a live index          |
| 2026-09-15 | `[Browse offers]` is plain text and opens that board; the keyboard gained `[Open InnoExchange]`  | Supersedes the 2026-09-14 row: browsing has a chat answer now, and the mini app keeps a one-tap button                 |
| 2026-09-15 | The poster's confirmation reaches the taker as the taker's own claim card, not a sentence        | It is the message that has to carry the handle and `[Mark as done]`; the renderer already did both                     |
| 2026-09-15 | The two sides of a claim are notified independently, and a refused button is dropped, not the DM | A taker was never told they had been confirmed: one message's failure must not cancel the other's                      |
| 2026-09-15 | A claim carries both methods: `method` (pays with, from `getMethods`) and `receiveMethod`        | A taker picked how they pay but not how they are paid, so the poster had to ask; `giveMethods` is the offer's own list |

## 11. Roadmap (suggested order — dependency and value)

1. **Offers core** — `features/offers`: service (create/edit/pause/close with the
   `amount ≥ filled + reserved` rule), API, Mini App Browse / Offer / Create screens, TanStack
   Router + Query, typed `hc<Api>` client. Deep links `startapp=offer_<id>`.
2. ~~**Channel sync**~~ — render, edit in place, delete, coalescing queue, 429 retry: done 2026-09-13
   (`features/offers/channel.ts`). No bumping; Take button waits for claims.
3. ~~**Claims handshake**~~ — done 2026-09-13 on all three surfaces (`features/claims`: service, API,
   take screen, claim cards, request DMs with Confirm/Decline, two-sided Done, contact gating,
   idempotent stale buttons). See docs/features/claims.md.
4. ~~**Bot parity**~~ — done 2026-09-14: reply keyboard, `/new` and `[Edit]` wizard, `/mine` with
   offer and request cards, `/board`, `/help`, `/cancel`, and the take wizard from
   `?start=take_<id>`, all on the same services as the Mini App. See
   [features/bot.md](features/bot.md).
5. ~~**Scheduler**~~ — done 2026-09-14 (`scheduler.ts`, `features/offers/notify.ts`): expiry with a
   one-tap `[Repost]`, 48 h check-ins on no-expiry offers, auto-pause after 24 h of silence, 12 h
   pending auto-decline, and closing an offer now tells the takers it declined. See §6 and
   [features/offers.md](features/offers.md) § Scheduler.
6. **Access & admin** — switch on `MEMBER_CHATS` gating, per-user rate limits, admin remove/ban.
7. ~~**Deploy**~~ — Dockerfile, compose, webhook mode, runbook: done 2026-09-13 (first real deploy pending).

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
