# Deployment

The same image runs locally and in the cloud; only environment variables differ. See [`.env.example`](../.env.example) for every variable.

## Local (Docker Compose)

```bash
cp .env.example .env
docker compose -f docker/docker-compose.yml up --build
```

Brings up the app (`http://localhost:3000`), Postgres, and MinIO. The relay is the public `wss://relay.clasp.to`. *(The current MVP only needs the relay to host and play; Postgres and MinIO are provisioned for the upcoming auth/saved-games/uploads work.)*

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
