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

## Spectator stream TURN (Retro Arcade, optional)

The Retro Arcade "watch by room code" stream is WebRTC: the host sends the emulator
video+audio straight to each viewer, and CLASP carries only the signaling (offer /
answer / ICE). By default the app uses public STUN servers, which is enough when at
least one side can accept a direct connection. Behind a symmetric/CGNAT network on
both ends, STUN fails and the viewer sees "Could not connect ... needs a TURN
server". **CLASP is signaling-only (pub/sub); it is not a TURN server.** TURN is a
separate media relay you run.

To enable it:

1. **Stand up a TURN server** (e.g. [coturn](https://github.com/coturn/coturn)) on a
   host with a public IP, open UDP/TCP 3478 (and 5349 for `turns:`), and create a
   long-term credential (`user:pass`). A static secret is fine for one deployment;
   for many users prefer coturn's time-limited REST credentials.
2. **Point the app at it** in `/opt/doot/.env` (the `NUXT_PUBLIC_` prefix is
   required so Nuxt overrides `runtimeConfig.public` at runtime), then recreate the
   app (`docker compose up -d --force-recreate app`):
   ```
   NUXT_PUBLIC_TURN_URL=turn:turn.doot.games:3478,turns:turn.doot.games:5349
   NUXT_PUBLIC_TURN_USERNAME=doot
   NUXT_PUBLIC_TURN_CREDENTIAL=<the-secret>
   ```
   The url may be a comma-separated list. STUN stays in the list as the cheaper
   first option; TURN is the fallback. Empty (the default) keeps STUN-only. Wiring:
   `apps/web/app/plugins/rtc.client.ts` calls `setRtcConfig` once at app start.

This stays a small, additive layer: gameplay and controller input never touch WebRTC
(they ride CLASP), so a missing TURN server only affects spectators on hard NATs.

## Backups

The durable state is the libSQL/SQLite file at `/opt/doot/data/doot.sqlite` (it also
holds better-auth's accounts + password hashes). It is small (accounts + saved game
definitions + decks), so backups are quick. *(There is no Postgres yet, so don't
schedule `pg_dump`.)*

### Automatic snapshots to Spaces (built in)

When object storage (`SPACES_*`) is configured, the app backs the database up
automatically: a server plugin (`apps/web/server/plugins/backup.ts`) takes a
`VACUUM INTO` snapshot ~30s after boot and then hourly, gzips it, and uploads it
**privately** to `backups/db/<YYYY>/<MM>/<DD>/<stamp>.sqlite.gz`
(`apps/web/server/utils/backup.ts`). `VACUUM INTO` runs through libSQL itself, so the
copy is transaction-consistent with no WAL-format risk.

> We deliberately do **not** use Litestream here: it streams the SQLite `-wal` and must
> share checkpoint control with the writer, but we run **libSQL** (its own virtual-WAL),
> Litestream documents no libSQL support, and v0.5.6/0.5.7 had a silent replication-loss
> bug. Revisit only after moving to plain SQLite or (better) Managed Postgres.

Tune with `BACKUP_INTERVAL_MS` (default 1h) or turn off with `DOOT_BACKUP_DISABLED=1`.
Backups are private; the upload uses `x-amz-acl: private`, never `public-read`.

**Operator setup (one time):**
- Generate a **Spaces access key** (Console → Spaces → access keys) for restores. The
  app already uses `SPACES_KEY`/`SPACES_SECRET`; reuse them or make a read-only key.
- Add a **lifecycle rule** on the bucket to expire `backups/db/` after N days (e.g. 30),
  so old snapshots prune themselves. (Console → the Space → Settings → lifecycle, or
  `s3api put-bucket-lifecycle-configuration`.)
- Consider a dedicated private bucket (or a bucket policy denying public listing) so
  backups never sit next to the public image objects.

### Restoring (or just verifying a backup)

`scripts/restore-db.mjs` lists the snapshots, downloads the latest (or `BACKUP_KEY=...`),
gunzips it, and runs `PRAGMA integrity_check` + row counts. Run it from a workspace
checkout (or inside the app container) with the `SPACES_*` env set:

```
SPACES_ENDPOINT=... SPACES_REGION=... SPACES_BUCKET=... SPACES_KEY=... SPACES_SECRET=... \
  node scripts/restore-db.mjs ./restored.sqlite
```

It does **not** overwrite the live DB; it prints the swap-in steps (stop the app,
`cp restored.sqlite /opt/doot/data/doot.sqlite`, start the app). Do a periodic restore
drill so you know the backups are good. (`scripts/backup-drill.mjs` proves the
snapshot+restore round-trip locally with no network.)

### Block volume + whole-system snapshots (secondary net)

Put `/opt/doot/data` on a **DigitalOcean Block Storage volume** (resizable, survives a
droplet rebuild, snapshottable), and enable scheduled volume/droplet snapshots as the
whole-system safety net (covers the `.env`, the GoatCounter SQLite file, and any local
uploads, not just the app DB). Volume/droplet snapshots are crash-consistent (a restore
relies on SQLite crash recovery), so they complement the logical `VACUUM INTO` backup
rather than replace it. Sketch with `doctl`:

```
# one-time: create + attach a volume, then mount it at /opt/doot/data and point the
# compose bind-mount at it (docker-compose.deploy.yml), then copy the existing data in.
doctl compute volume create doot-data --region <rgn> --size 10GiB --fs-type ext4
doctl compute volume-action attach <volume-id> <droplet-id>
# scheduled snapshots (or enable weekly droplet backups in the Console):
doctl compute volume snapshot <volume-id> --snapshot-name "doot-$(date +%F)"
```

## Observability (errors + health)

A solo operator should know when something breaks without tailing logs. Errors are
captured in-memory and surfaced in the admin console:

- **Server errors** (unhandled 5xx; `server/plugins/error-track.ts` hooks Nitro's `error`)
  and **client errors** (Vue/window/promise; `app/plugins/error-track.client.ts` posts to
  the rate-limited, anonymous `POST /api/client-errors`) are recorded in two capped
  in-memory rings (`server/utils/observability.ts`; per-instance runtime state, never the
  DB). They show in **`/admin` -> Status** alongside the last backup time.
- This is vendor-neutral and needs no external account. To ALSO get a push alert, set
  **`DOOT_ERROR_WEBHOOK`** to any Slack/Discord-style incoming webhook (the forward is
  throttled and sends both `text` and `content` so either works); unset = stdout logs only.
- Page analytics stay separate (GoatCounter; see above). The `/api/health` endpoint is the
  cheap liveness probe used by the container health check and the post-deploy CI smoke.

## Scaling later

- Wire `drizzle-orm/node-postgres` behind the existing `useDb()` seam and select
  the driver by `DATABASE_URL`, then point it at DigitalOcean Managed Postgres.
- Run several stateless app containers behind a load balancer, no session
  affinity needed (live state is on the relay; rate-limiting would move to a
  shared store).
- If the public relay becomes a limit, stand up a self-hosted relay and point
  `CLASP_RELAY_URL` at it (and widen the room-code length).
