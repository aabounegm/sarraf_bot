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
  main.ts               boot: config → db (auto-migrate) → bot (long polling) → http
  config.ts             zod-validated env (see .env.example)
  db/                   schema.ts, index.ts (openDb); migrations in apps/bot/drizzle/
  bot/                  createBot(): plugins (session in SQLite, i18n), BotContext type
  http/                 createHttp(): Hono app: /api routes + serves apps/webapp/dist (SPA fallback); auth.ts = initData verification
  features/<name>/      (to be created per feature) bot.ts | api.ts | service.ts — vertical slices

apps/webapp/src/      Feature-Sliced Design: app/ pages/ widgets/ features/ entities/ shared/
  app/main.tsx          initTelegram() → createLocalization() → <App>
  app/telegram.ts       SDK init; mocks the Telegram env in dev outside Telegram
  shared/lib/i18n.ts    Fluent bundle from @sarraf/shared/locales
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
- Mini app auth: `Authorization: tma <initData>` header, verified server-side with HMAC
  (`apps/bot/src/http/auth.ts`); routes after `telegramAuth` read `c.get('user')`.
- The Hono app type is exported as `Api` for `hc<Api>()` in the mini app (end-to-end typed client).

## Working agreement with the owner

- **Never commit unless asked.** Show what changed and wait for approval.
- Discuss before deciding when something isn't specified; push back when a request doesn't make sense.
- Documentation is a deliverable: update this file's _Current state_, `docs/architecture.md`
  (decisions log) and the relevant `docs/features/*.md` as part of the change, not after.

## Current state

**Bootstrapped skeleton, no features yet** (2026-09-12). Working: workspace, shared domain
package with tests, Drizzle schema + first migration, bot boots with session + i18n and answers
`/start` with an "Open InnoExchange" button, Hono `/api/health` and `/api/me` (auth-gated) plus
serving the built mini app with SPA fallback, mini app renders TelegramUI `AppRoot` with the
localized app name. `pnpm check` is green.

Not yet done, suggested order (see architecture.md → Roadmap for detail):

1. Offers feature: create/list/detail (service + API + mini app Browse/Detail/Create screens,
   TanStack Router (code-based) + TanStack Query, `hc<Api>('/api')` client)
2. Channel post sync (render + edit in place / delete, rate-limit aware; no bumping)
3. Claims handshake (take → confirm/decline → two-sided done; bot notifications)
4. Bot `/new` wizard (`@grammyjs/conversations`), `/mine`, take wizard from `?start=take_<id>`
5. Scheduled jobs (DB-driven, restart-safe): expiry, 48h check-in for no-expiry offers, 12h pending auto-decline
6. Access gating switch (`MEMBER_CHATS` via `getChatMember`), admin commands
7. Deployment: Dockerfile, compose (bot + Caddy), SQLite backup

Resolved questions and their answers are at the end of docs/architecture.md.
