# Deployment

The same image runs locally and in the cloud; only environment variables differ. See [`.env.example`](../.env.example) for every variable.

## Local (Docker Compose)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

Brings up the app (`http://localhost:3000`), Postgres, and MinIO. The relay is the public `wss://relay.clasp.to`. *(Hosting and playing need only the relay; auth, saved games, and uploads are shipped, the durable store is libSQL/SQLite by default with a `DATABASE_URL` override, and MinIO/Spaces backs presigned image uploads. A `postgres://` URL currently falls back to SQLite with a warning.)*

## Local without Docker

```bash
pnpm install
pnpm dev        # Nuxt dev server on http://localhost:3000
```

## Single droplet (production)

The live site (https://doot.games) deploys by **git push**, not by building on
the droplet. Pushing to `main` runs `.github/workflows/deploy.yml`:

1. **check** - `pnpm test` + `pnpm -r typecheck` (gates the rest).
2. **build** - builds `docker/Dockerfile` and pushes the image to GHCR
   (`ghcr.io/virgilvox/doot-games:latest`).
3. **deploy** - SSHes to the droplet, copies `docker/docker-compose.deploy.yml`
   + `docker/Caddyfile`, and runs `docker compose pull && up -d`.

`docker-compose.deploy.yml` runs the prebuilt image plus **Caddy** (automatic
HTTPS). State is a **SQLite file** on a host bind-mount (`./data:/app/.data`),
which persists across deploys; there is **no Postgres** in this path (the app
runs the libSQL/SQLite store). Startup migrations are idempotent, so every
deploy migrates. Secrets live in `/opt/doot/.env` on the droplet (never in git):
`SESSION_PASSWORD`, `PUBLIC_BASE_URL=https://doot.games`,
`DATABASE_URL=file:/app/.data/doot.sqlite`, and the `SPACES_*` vars.

To set this up on a fresh droplet: install Docker, create `/opt/doot` with a
`data/` dir and a `.env`, add the deploy key to `authorized_keys`, set the repo
secrets (`DROPLET_HOST`, `DEPLOY_SSH_KEY`), point your domain's A record at the
droplet, and set the domain in `docker/Caddyfile`. Then push to `main`.

> `docker/docker-compose.prod.yml` (a Postgres-based, build-on-host variant) is
> **aspirational** and not what CI uses; Postgres is not wired in code yet (a
> `postgres://` `DATABASE_URL` currently falls back to SQLite with a warning).
> Prefer the `deploy.yml` path above.

## Analytics (GoatCounter)

Traffic analytics are an **opt-in, self-hosted GoatCounter** instance: a single
Go binary on its own SQLite file (`./data/goatcounter` on the droplet), behind
Caddy at **`stats.doot.games`**. It is privacy-friendly (no cookies, no personal
data) and idles at ~25-50MB, so it fits the 1GB droplet; the compose service is
capped at 128MB so it can never starve the app. The `goatcounter` service and the
`stats.doot.games` Caddy block ship in `docker-compose.deploy.yml` / `Caddyfile`,
so the next deploy starts it. To switch it on:

1. **DNS:** add an A record for `stats.doot.games` pointing at the droplet (same
   IP as `doot.games`). Caddy provisions the TLS cert automatically.
2. **On a 1GB droplet, add swap first** (cheap OOM insurance, since you are
   adding a container): `fallocate -l 1G /swapfile && chmod 600 /swapfile &&
   mkswap /swapfile && swapon /swapfile`, then persist it in `/etc/fstab`.
3. **Deploy** (push to `main`) so the `goatcounter` container comes up.
4. **Create the first site + login:** `docker compose -f
   docker-compose.deploy.yml exec goatcounter goatcounter db create site
   -vhost=stats.doot.games -user.email=you@example.com` (it prompts for a
   password). Log in at `https://stats.doot.games`.
5. **Turn on tracking:** add `NUXT_PUBLIC_GOATCOUNTER_URL=https://stats.doot.games`
   to `/opt/doot/.env` and recreate the app (`docker compose up -d --force-recreate
   app`). The `NUXT_PUBLIC_` prefix is required: Nuxt only overrides
   `runtimeConfig.public` from env at runtime via that prefix (a plain
   `GOATCOUNTER_URL` is baked at build time and won't take effect). The app then
   loads GoatCounter's `count.js`, which counts the entry page; the plugin
   (`app/plugins/analytics.client.ts`) adds each SPA route change. With the var
   unset, no tracking script is loaded at all.

The GoatCounter SQLite file lives under `./data/goatcounter`; back it up the
same way as the app DB below.

## Backups

The durable state is the SQLite file at `/opt/doot/data/doot.sqlite`. Back it up
with a timed copy to a Spaces bucket (e.g. `sqlite3 doot.sqlite ".backup
/tmp/doot.bak"`, then upload). It holds only small durable state (accounts +
saved game definitions), so backups are quick. *(There is no Postgres, so don't
schedule `pg_dump`.)*

## Scaling later

- Wire `drizzle-orm/node-postgres` behind the existing `useDb()` seam and select
  the driver by `DATABASE_URL`, then point it at DigitalOcean Managed Postgres.
- Run several stateless app containers behind a load balancer, no session
  affinity needed (live state is on the relay; rate-limiting would move to a
  shared store).
- If the public relay becomes a limit, stand up a self-hosted relay and point
  `CLASP_RELAY_URL` at it (and widen the room-code length).
