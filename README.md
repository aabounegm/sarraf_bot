<img src="docs/brand/bot.png" alt="" width="104" align="right" />

# sarraf_bot — InnoExchange

Telegram bot + Mini App for peer-to-peer currency swaps inside a trusted community
(Innopolis residents; USDT/USD/EUR/AED/RUB/EGP). The bot is a **notice board, not a
middleman**: it never holds funds. It makes offers structured, tells people whether an
offer is _actually still available_ before they DM the poster, keeps one channel post per
offer in sync with the offer's state, and supports partial fills by multiple takers.

Three surfaces, one backend:

| Surface                       | What it is                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| **Bot** (`@innoexchange_bot`) | `/start`, step-by-step `/new`, `/mine`, and all handshake notifications (request → confirm → done). |
| **Mini App**                  | The board: browse, offer detail, take, create/edit, my offers. React + TelegramUI.                  |
| **Channel** (`@innoexchange`) | One bot-authored post per offer, edited on every state change, deleted on completion.               |

The product spec (domain model, flows, business rules, copy) lives in
[docs/spec.md](docs/spec.md) with 11 screenshots in [docs/screenshots/](docs/screenshots/). Architecture and decisions: [docs/architecture.md](docs/architecture.md).
Agent onboarding: [CLAUDE.md](CLAUDE.md).

## Stack

- **Node 24** running TypeScript natively (no build step for the backend), **pnpm** workspaces
- **grammY** (bot) + **Hono** (HTTP API) in one process, `@grammyjs/i18n` (Fluent) for en/ru/ar
- **SQLite via `node:sqlite`** + **Drizzle ORM 1.0 RC** (`drizzle-orm/node-sqlite`), migrations with drizzle-kit
- **Vite + React 19 + `@telegram-apps/telegram-ui`** for the Mini App, Feature-Sliced Design
- **Oxlint + Oxfmt**, `node:test`, zod

## Quick start

Prerequisites: Node ≥ 24, pnpm ≥ 9 (`corepack enable` gives you one).

```sh
pnpm install
cp apps/bot/.env.example apps/bot/.env   # fill in BOT_TOKEN (from @BotFather), PUBLIC_URL, OFFERS_CHANNEL
pnpm dev                                 # bot + API on :3000, Vite on :5173 (proxies /api → :3000)
```

`PUBLIC_URL` must be HTTPS for Telegram to open it — in development point a tunnel
(e.g. `cloudflared tunnel --url http://localhost:5173`) at Vite and set the URL in @BotFather
(`/newapp` or the bot's Menu Button) and in `.env`. Opening `http://localhost:5173` in a plain
browser also works: the SDK environment is mocked and the API (`/api/dev/init-data`, non-production
only) signs initData for a fake user, so API calls succeed.

## Commands

| Command                                                   | Does                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev`                                                | runs `dev` in every workspace in parallel                                             |
| `pnpm check`                                              | typecheck + lint + format check + tests (run before committing)                       |
| `pnpm typecheck` / `pnpm test` / `pnpm lint` / `pnpm fmt` | individually                                                                          |
| `pnpm --filter @sarraf/bot db:generate`                   | generate a migration from `apps/bot/src/db/schema.ts` (applied automatically on boot) |
| `pnpm --filter @sarraf/webapp build`                      | production build to `apps/webapp/dist`                                                |

## Layout

```
apps/bot/          grammY bot + Hono API + Drizzle (one Node process). Vertical feature slices.
apps/webapp/       Telegram Mini App (Vite + React + TelegramUI). Feature-Sliced Design.
packages/shared/   Isomorphic only: domain config, money math, types, Fluent locales.
docs/              architecture.md, spec.md, screenshots/, features/ (one per feature), brand/ (avatars)
```

## Deployment

One bot = one subdomain = one Docker container (`Dockerfile`, `compose.yml`); the host's Caddy adds a
single `reverse_proxy` block. In production the bot uses a webhook at `PUBLIC_URL/webhook`. Full
runbook — DNS, Caddy, BotFather, dev bot + tunnel, backups, updates: [docs/deployment.md](docs/deployment.md).
