# Deployment

One bot = one origin = one container. `https://innoexchange.bots.abounegm.com` serves the mini app
at `/`, the API at `/api/*` and Telegram's webhook at `/webhook`, all from the single Node process
in the container. The host's existing Caddy terminates TLS and reverse-proxies to it. Other bots
get their own subdomain, container and published port.

## One-time setup

1. **DNS** — a `*.bots.abounegm.com` A record → VPS IP, set to **DNS only (grey cloud)**.
   Why not proxied: Cloudflare terminates TLS at its edge, and the free Universal SSL certificate
   covers `abounegm.com` and `*.abounegm.com` only — one label deep. For a two-label name like
   `innoexchange.bots.abounegm.com` the edge has no certificate and answers every browser with a TLS
   handshake failure (`ERR_SSL_VERSION_OR_CIPHER_MISMATCH`) before the VPS is ever reached; the
   existing proxied `*.abounegm.com` wildcard resolves these names but cannot serve them. DNS-only
   makes browsers connect to Caddy directly, which issues its own Let's Encrypt certificate per
   hostname (HTTP-01 on port 80 or TLS-ALPN on 443, automatic). The alternative is Cloudflare's
   paid Advanced Certificate Manager for a `*.bots.abounegm.com` edge certificate.
   Check: `dig +short innoexchange.bots.abounegm.com @hayes.ns.cloudflare.com` must print the VPS IP,
   not `104.21.x.x` / `172.67.x.x`.
2. **Caddy** (on the host) — add one block and reload:
   ```caddyfile
   innoexchange.bots.abounegm.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```
3. **BotFather** — for the production bot, and make it an admin of the offers channel:
   - `/newapp`, short name **`app`**, URL `https://innoexchange.bots.abounegm.com` — this is what
     makes the channel post's `t.me/<bot>/app?startapp=offer_1042` links open the mini app
     (`miniAppLink` in `packages/shared`; the short name is baked in there).
   - _Bot Settings → Configure Mini App → Enable_, same URL — the "Open App" button on the bot's
     profile. There is no Bot API method for either of these two; they are BotFather-only.
   - The **Menu Button** needs nothing here: the bot sets it to the mini app on every boot
     (`registerMenu`, [features/bot.md](features/bot.md)), together with the "/" command menu.
   - `/setuserpic` → `docs/brand/bot.png`; the channel's photo (Manage → Edit → set photo) →
     `docs/brand/channel.png`. Two chat bubbles holding `$` and `₽`, blue for the bot and amber for
     the channel, laid out to survive Telegram's circular crop. The `.svg` beside each PNG is the
     source; re-render with `chrome --headless --screenshot=bot.png --window-size=512,512 bot.svg`.
4. **Server checkout** — `git clone … && cd sarraf_bot`, then create `apps/bot/.env`:
   ```
   BOT_TOKEN=…
   PUBLIC_URL=https://innoexchange.bots.abounegm.com
   OFFERS_CHANNEL=@innoexchange
   MEMBER_CHATS=
   ```
   (`NODE_ENV`, `BOT_MODE=webhook`, `DATABASE_PATH` and `PORT` are set by `compose.yml`.)
5. `docker compose up -d --build`. On boot the container applies migrations and calls `setWebhook`
   with `PUBLIC_URL/webhook`; the secret token is derived from the bot token, so there is nothing
   else to configure. `curl https://innoexchange.bots.abounegm.com/api/health` → `{"ok":true}`.

## Updating

`git pull && docker compose up -d --build`. Migrations run on start; the webhook is re-registered
(idempotent). Downtime is the container restart (seconds); Telegram retries webhook deliveries.

## Backups

The SQLite file lives in the `data` volume. Take consistent copies with SQLite's backup API
(safe under WAL), e.g. nightly from cron:

```sh
docker compose exec innoexchange node -e "
  const { DatabaseSync, backup } = require('node:sqlite');
  backup(new DatabaseSync('/data/sarraf.db', { readOnly: true }), '/data/backup.db').then(() => console.log('ok'))"
docker compose cp innoexchange:/data/backup.db ./backups/sarraf-$(date +%F).db
```

## Local development

- **Plain browser:** `pnpm dev` → `http://localhost:5173`. The Telegram environment is mocked and
  the API's dev endpoint signs initData for a fake user, so everything works without Telegram.
- **Inside Telegram:** use a **separate dev bot** (e.g. `innoexchange_dev_bot`) — BotFather's
  Menu Button / `/newapp` URL and the webhook are per bot, so never point the production bot at a
  laptop. Put its token in `apps/bot/.env` with `BOT_MODE=polling` (no public URL needed for the
  bot itself). The mini app must be reachable over HTTPS: tunnel Vite, e.g. a named Cloudflare
  tunnel `dev-innoexchange.bots.abounegm.com → http://localhost:5173`, set that as `PUBLIC_URL`
  and register it once in the dev bot's BotFather settings.
- Switching a bot from webhook back to polling needs no manual step: `bot.start()` deletes the webhook.

## Adding another bot

New subdomain + Caddy block, new checkout with its own `apps/bot/.env`, and a different published
port in its `compose.yml` (`127.0.0.1:3001:3000`, …). Each bot keeps its own database volume.
