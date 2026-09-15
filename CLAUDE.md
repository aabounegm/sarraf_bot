# CLAUDE.md — agent onboarding

Read this first, then whatever the task needs. Work happens across many short sessions, so keep
the **Current state** section at the bottom accurate before you stop.

## What this is

InnoExchange: a Telegram bot + Mini App where community members post currency-swap offers
and take each other's offers. No escrow, no funds handled. See [README.md](README.md) for the
one-paragraph pitch and [docs/architecture.md](docs/architecture.md) for every decision and why.

## Read in this order

1. [docs/spec.md](docs/spec.md) — **the spec**: domain model, every screen, bot flows, channel
   post format, business rules. [docs/screenshots/](docs/screenshots/) shows all three surfaces at
   each step of the flow (view them — they are the UI reference).
2. [docs/architecture.md](docs/architecture.md) — stack, layout, conventions, decisions log, open questions.
3. `packages/shared/src/` — the domain vocabulary (currencies, money, offer/claim statuses).
4. `apps/bot/src/db/schema.ts` — the data model.
5. `docs/features/<feature>.md` if one exists for what you're touching.

## Commands

```sh
pnpm dev        # everything, in parallel
pnpm check      # typecheck + lint + fmt:check + test — must pass before you say you're done
pnpm fmt        # oxfmt writes; oxlint has no --fix step configured
pnpm --filter @sarraf/bot db:generate     # after editing schema.ts; commit the drizzle/ folder
pnpm --filter @sarraf/bot test            # node:test, files named *.test.ts
```

Use **pnpm, not npm** (npm is misconfigured on the owner's machine and hangs). `pnpm add` inside
a workspace: `pnpm --filter @sarraf/bot add <pkg>`; root dev tools: `pnpm add -w -D <pkg>`.

## Layout and where things go

```
packages/shared/      isomorphic — NO Node/DOM APIs. Imported by both apps as @sarraf/shared.
  src/currencies.ts     currency + payment-method config, rate-base order, expiry options
  src/money.ts          amounts are integer minor units (×100); convert(); formatAmount()
  src/offer.ts          Offer/Claim statuses; availability() = the one definition of "available"
  locales/{en,ru,ar}.ftl Fluent catalog shared by bot and mini app (parity test in src/locales.test.ts)

apps/bot/src/         one Node process: bot + API + DB
  main.ts               boot: config → db (auto-migrate) → getMe + channel queue → http → bot (polling or webhook)
  scheduler.ts          runDueWork(db, now): expiry, 12h auto-decline, 48h check-in, 24h auto-pause; 60s tick
  config.ts             zod-validated env (see .env.example)
  db/                   schema.ts, index.ts (openDb); migrations in apps/bot/drizzle/
  bot/                  createBot(): plugins (session in SQLite, i18n, conversations), BotContext; i18n.ts = the shared Fluent instance
  bot/menu.ts           the reply keyboard and /start /help /board /cancel; bot/wizard.ts = the question steps both wizards use
  bot/testing.ts        harness for *.test.ts: records Telegram calls, say()/tap() drive real updates
  http/                 createHttp(): Hono app: /api routes + serves apps/webapp/dist (SPA fallback); auth.ts = initData verification
  lib/app-error.ts      AppError(status, code): thrown by services, mapped by http/index.ts onError and by errorText() in the bot
  lib/telegram-queue.ts serialised fire-and-forget sends + 429 retry, shared by channel.ts and notify.ts
  features/offers/      service.ts (rules) · api.ts · bot.ts (/new /mine) · wizard.ts · render.ts · channel.ts · notify.ts (the scheduler's DMs) · *.test.ts — the pattern for every feature
  features/claims/      the take → confirm → done handshake: service.ts · api.ts · bot.ts (buttons) · card.ts · wizard.ts (take) · notify.ts (DMs)

apps/webapp/src/      Feature-Sliced Design: app/ pages/ widgets/ features/ entities/ shared/
  app/main.tsx          initTelegram() → createLocalization() → createAppRouter(start_param) → <App>
  app/router.tsx        code-based TanStack routes; memory history seeded from start_param
  pages/*               one folder per screen; compose widgets/features; no data logic
  widgets/offer-card    list row used by Browse and My offers
  features/*            offer-form (state → OfferInput), manage-offer (pause/resume/close), manage-claim (ClaimCard/ClaimRow)
  entities/{offer,claim} model.ts (types via InferResponseType), api.ts (Query hooks), format.ts (localized text)
  shared/api/client.ts  hc<Api>('/api') + unwrap() → ApiError(code)
  shared/lib/telegram.ts initTelegram (mocks env in dev), useMainButton/useBackButton, haptic, confirmDialog
  shared/lib/i18n.ts    Fluent bundle from @sarraf/shared/locales
  shared/ui/Page.tsx    Page (back button) and PrimaryButton (native main button or fallback)
```

Rules of thumb:

- Business logic that both the bot and the API need goes in `apps/bot/src/features/<x>/service.ts`
  and is called from both `bot.ts` and `api.ts` of that slice. Pure, surface-independent rules
  (validation, math, constants) go in `packages/shared`.
- Every user-facing string in both surfaces comes from the `.ftl` files. Add the id to **all three**
  locales (the parity test fails otherwise). Bot: `ctx.t('id', vars)`. Mini app: `<Localized id>` / `useLocalization()`.
- Money: integer minor units everywhere except user input/display. Rates are `1 base = rate quote`
  with base = `rateBase(give, get)` (see `currencies.ts`). Timestamps: epoch ms (`timestamp_ms` columns).
- Callback data / deep links (`startapp=offer_1042`, `take_1042`) are defined once in `packages/shared`
  when the feature that uses them lands — never as string literals in two places.
- Names and handles are never literals: bot username from `ctx.me` / `bot.botInfo`, channel from
  `config.OFFERS_CHANNEL`, display name from the `.ftl` catalog.
- When a feature touches both surfaces, add/update `docs/features/<name>.md` with, side by side:
  bot entry points (commands, callbacks, notifications), mini app screens, API routes, and the
  channel-post effect. This is the drift guard between bot and mini app.
- Prefer deleting over adding. No abstraction with one implementation, no config for a value that
  never changes.

## Conventions and gotchas

- TypeScript runs natively on Node 24: relative imports need the `.ts` extension; no enums,
  namespaces or parameter properties (`erasableSyntaxOnly`). `tsc` is typecheck-only (`noEmit`).
- TypeScript is v7 (the native compiler). Oxfmt sorts imports and `package.json` keys.
- Oxfmt also formats Markdown (aligns tables, may eat inline-code that looks like a comment). Run
  `pnpm fmt` after editing docs; don't hand-align tables.
- Drizzle is **1.0 RC** (`drizzle-orm@rc`, `drizzle-kit@rc`) because that is where the
  `node:sqlite` driver lives. We call `drizzle({ client })` — passing `schema` failed to typecheck
  on the node-sqlite overload; if relational queries are ever needed, look at 1.0's `relations`
  option. Migrations are folders `drizzle/<timestamp>_<name>/migration.sql` and run on boot via `migrate()`.
- Queries use the Drizzle query builder only (no raw SQL) so a Postgres move is a schema-file
  and connection change. Sync driver: use `.get()` / `.all()` / `.run()`.
- `node:sqlite` is opened with `PRAGMA foreign_keys = ON` and WAL; tests use `':memory:'`.
- Config: `PUBLIC_URL` is the bot's HTTPS origin (button URL + webhook + dev tunnel); `BOT_MODE`
  `polling` (dev) or `webhook` (prod, secret = sha256 of the token, see `config.ts`).
- Mini app auth: `Authorization: tma <initData>` header, verified server-side with HMAC
  (`apps/bot/src/http/auth.ts`); routes after `telegramAuth` read `c.get('user')`.
- The Hono API type is exported as `Api` from `@sarraf/bot/api` (bot `package.json` exports) and imported
  type-only by the mini app's `shared/api/client.ts`. Consequence: the webapp typecheck compiles bot
  sources too, so its tsconfig includes `node` types. Response types come from `InferResponseType`.
- Mini app in a plain browser (`isMocked()`): Telegram's main/back buttons don't exist, so `Page` and
  `PrimaryButton` render in-page fallbacks. Each locale has a `locale-tag` message used for `Intl`.

## Working agreement with the owner

- **Never commit unless asked.** Show what changed and wait for approval.
- Discuss before deciding when something isn't specified; push back when a request doesn't make sense.
- Documentation is a deliverable: update this file's _Current state_, `docs/architecture.md`
  (decisions log) and the relevant `docs/features/*.md` as part of the change, not after.

## Current state

**Offers, channel post, the claims handshake, the bot chat and the scheduler, 2026-09-14.** See
[docs/features/offers.md](docs/features/offers.md), [docs/features/claims.md](docs/features/claims.md)
and [docs/features/bot.md](docs/features/bot.md). Working on **both** surfaces:
create/browse/detail/edit/pause/resume/close/repost; take → confirm/decline → two-sided done (request DM
with [Confirm] [Decline], re-rendered on every transition, stale buttons answer "Already closed");
"Your requests"; contact gating; every mutation re-renders the channel post (verified against a real
channel). In the chat: the reply keyboard, Telegram's "/" menu (`setMyCommands` at boot, the same
list `/help` prints), the `/new` and [Edit] wizards, `/mine` cards with their
buttons, `/board`, `/help`, `/cancel`, and the take wizard from `?start=take_<id>`, all calling the
same services as the API. Dev-in-browser works end to end — `?user=2` in the URL gives a second
identity, which is how the handshake is tested from one machine.

Nothing goes stale on its own any more: `scheduler.ts` ticks every 60s and asks the database what is
due — expire the offer (post deleted, poster gets [Repost]), time out a 12h-old pending request
(taker told), ping the poster of a no-expiry offer every 48h ([Yes, still on] [Pause] [Close]) and
pause it 24h later if nobody answers. Every job calls the same services the buttons do, so there is
one code path per outcome; the due-work is `runDueWork(db, now)`, which is how the tests drive it.
`pnpm check` is green (47 bot tests, 7 shared). Not yet exercised against a real chat: the claim DMs,
the wizards and the scheduler's DMs.

Not yet done, suggested order (see architecture.md → Roadmap for detail):

1. ~~Offers core~~ ✔
2. ~~Channel post sync~~ ✔
3. ~~Claims handshake~~ ✔ (both surfaces)
4. ~~Bot parity~~ ✔ — wizards via `@grammyjs/conversations`, `/mine`, reply keyboard, take deep link
5. ~~Scheduled jobs~~ ✔ — `scheduler.ts` + `features/offers/notify.ts`
6. Access gating switch (`MEMBER_CHATS` via `getChatMember`), admin commands
7. ~~Deployment~~ ✔ — Dockerfile, compose.yml, webhook mode, docs/deployment.md (first real deploy pending)

Resolved questions and their answers are at the end of docs/architecture.md.
