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

1. Provision a droplet and attach a block-storage Volume; mount it at `/mnt/doot-data`.
2. Point your domain's A record at the droplet, and set the domain in `docker/Caddyfile`.
3. Create a `.env` with production values (`PUBLIC_BASE_URL`, `DB_PASSWORD`, `SESSION_PASSWORD`, `SPACES_*`).
4. Bring it up:

```bash
docker compose -f docker/docker-compose.prod.yml up -d --build
```

Caddy provisions and renews TLS automatically. The app is stateless (all live state is on the relay), so it restarts cleanly and scales horizontally.

## Backups

Schedule a `pg_dump` to a Spaces bucket on a timer. The database holds only small durable state, so backups are quick.

## Scaling later

- Swap `DATABASE_URL` to DigitalOcean Managed Postgres.
- Run several app containers behind a load balancer — no session affinity needed.
- If the public relay becomes a limit, stand up a self-hosted relay and point `CLASP_RELAY_URL` at it (and widen the room-code length).
