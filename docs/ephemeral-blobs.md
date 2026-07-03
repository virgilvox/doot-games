# Ephemeral blobs (the Claim-Check offload)

How Doot keeps heavy play artifacts (drawing galleries, photos, big results
screens) off the realtime relay without breaking an architecture invariant, and
without depending on any DigitalOcean Spaces feature that isn't already proven in
production.

## The problem

CLASP frames are length-prefixed with a **uint16**, so a single published value
physically cannot exceed **65535 bytes**. `@clasp-to/core`'s `encodeFrame` throws
`Payload too large: N bytes (max 65535)` past it, synchronously and in-band (it is
not routed to `onError`). Any game that aggregates many artifacts into one value
hits this: Doodle Chain's results "unspool" bundles every player's drawing, the
`drawvote`/`photovote` galleries pack every drawing/photo into one vote payload. A
lively game blows past 64 KB, the publish throws, and the room is stranded on the
results step (the reported "payload too large" bug).

## The pattern: Claim-Check

This is the textbook **Claim-Check** pattern (Azure Architecture Center;
Enterprise Integration Patterns "Store in Library"): store the heavy bytes out of
band and publish only a small reference over the relay. Applied *conditionally*,
values under the threshold stay inline, so small games never touch storage.

## The design (transparent, in the relay wrapper)

The whole mechanism lives in the engine's relay wrapper (`packages/engine/src/relay.ts`
+ `blob.ts`), so no game, block, or component changes:

- **Write** (`set`): if a value's encoded size exceeds `OFFLOAD_THRESHOLD_BYTES`
  (58 KB), upload the bytes via an `AssetTransport` and publish a tiny
  `{ __dootBlob: { url, n, ct } }` envelope instead. The upload is awaited (it
  resolves only once the object is durably readable), so a subscriber can never
  get a reference to an object that is not yet readable. Under the threshold,
  publish inline exactly as before.
- **Read** (`on` / `get`): if a delivered value is an envelope, fetch + parse it
  back to the original value before handing it to the engine. Late-join snapshots
  and reconnect resolve the same way. `cached` reports a miss for an envelope so
  callers fall back to the async `get`.
- **No storage configured**: an oversized value fails early with a friendly,
  actionable message (`tooLargeMessage`) instead of a raw, room-stranding crash.

`finish()` is the one engine method that `await`s its publish, so an oversized
results value's reference is on the relay before the phase flips to `results`, and
on failure it surfaces the error and stays in play rather than stranding. Other
heavy publishes (derived galleries, reveal summaries, per-player content, player
inputs) use `publishGuarded`: they offload without gating other state, and an
upload failure surfaces via the room's error rather than an unhandled rejection.

### The size gate must match CLASP's encoder, not JSON

CLASP stores every number as a tagged **float64 (9 bytes)**, so a point-heavy
drawing (arrays of floats) encodes *larger* than its JSON form. Gating on JSON
length would let such a value slip under the threshold and still overflow the
frame. `claspEncodedSize` mirrors CLASP's own `estimateValueSize` (null=1, bool=2,
number=9, string=UTF-8 bytes + overhead, array/object add a per-element type tag)
and is a safe upper bound on the real encoded size. The 58 KB threshold leaves
~7.5 KB of headroom under 65535 for the address + message framing.

## The transport: the app proxies to storage (no browser -> storage)

The `AssetTransport` is served entirely by our own API, same-origin:

- **Upload** (`POST /api/rooms/[code]/blobs`): the browser POSTs the raw bytes to
  our route; the **app** writes them to object storage with a signed PUT as a
  **private** object, and returns a same-origin read URL.
- **Read** (`GET /api/rooms/[code]/blobs/[id]`): the browser GETs that URL; the
  **app** reads the private object with a signed GET and streams the bytes back.

This deliberately uses only the two storage paths already proven against the
production Spaces bucket (signed PUT for image re-hosts, signed GET for backups).
It touches **none** of Spaces' shaky S3-compat areas (see "Why not direct browser
uploads" below): no browser CORS, no public-read ACL, no presigned POST, no CDN.
The cost is that offloaded bytes flow through the app; this is bounded (offload
only fires for genuinely large values, which are rare) and keeps the app stateless
(it just streams), so horizontal scaling is unaffected.

### Why not direct browser uploads (the DO Spaces findings)

A direct browser->Spaces design (presigned POST + public-read + a cross-origin
`fetch` read) stacks three of Spaces' least reliable behaviors, each a place prod
could diverge from permissive local MinIO:

- **Presigned POST Object** is not listed in DO's S3-compatibility table and is
  order-sensitive (undocumented `Key not specified` if the file field isn't last).
- **public-read ACL** has a silently-stores-private trap if the exact `x-amz-acl`
  header isn't sent.
- **CDN CORS** passthrough is stale-cache fragile and needs a purge on every CORS
  change; a cross-origin `fetch()` GET is required to read JSON back (unlike an
  `<img>`), so it would need bucket CORS `GET` that the prod bucket does not have.

Proxying through the app avoids all of it and needs **no prod bucket config**.

## Security (anonymous uploads)

Players host and play with no account, so the upload route is anonymous. It is
contained by:

- **Server-enforced size cap**: the app reads the body and rejects over
  `EPHEMERAL_MAX_BYTES` (a Content-Length pre-check plus a real post-read check),
  the hard cap a login-free endpoint needs.
- **Content-type allowlist** (`application/json`, PNG/JPEG/WebP).
- **Server-chosen unguessable keys** scoped to the room (`ephemeral/<code>/<uuid>`);
  the client never picks the key, and the read route strict-validates the id
  (`uuid.ext`) so it cannot escape the prefix or inject S3 request syntax.
- **Private objects**: nothing is world-readable; the app is the only reader.
- **Rate limiting** (`eph:` bucket, 120/min/IP in `server/middleware/rate-limit.ts`).
- **Lifecycle TTL** as a cleanup backstop.

## Ephemerality (TTL)

Objects self-expire via an S3 **lifecycle rule** on the `ephemeral/` prefix
(`EPHEMERAL_EXPIRE_DAYS = 1`), applied idempotently at startup
(`server/plugins/ephemeral-lifecycle.ts` -> `ensureEphemeralLifecycle`, non-fatal).
The merge preserves any existing rules (e.g. an operator's backups-expiry rule).
Lifecycle expiration is coarse and lazy (AWS ~daily; DO Spaces 24-48 h), so it is
garbage collection, **not** a secrecy or timing mechanism; the relay's own 8 h TTL
means a reference always expires before its object.

### Respecting the invariants

- **Nothing about a live room in the DB.** Object storage is not the durable
  game-definition DB; it is ephemeral (self-expiring) and holds only the same data
  that was already relay-bound. The app tier stays stateless (it only streams).
- **Answer-withholding.** The wrapper offloads whatever value was already going to
  be published (already redacted). A reference to a redacted value is as safe as
  the value; answer keys are still published only at reveal.
- **Reconnect is free.** References are in the snapshot; blobs resolve on read.

## Local dev and DigitalOcean (only proven paths, no bucket config)

Both MinIO and DO Spaces support signed PUT/GET and lifecycle rules, and the app
uses only those. **No bucket CORS or public-object config is required** in prod
beyond what the existing image uploads already rely on.

- **`pnpm dev` + MinIO on localhost:** set the `SPACES_*` vars (see `.env.example`)
  to `http://localhost:9000`. Create the bucket once (the docker `minio-setup`
  service does this, or `mc mb local/doot`). Nothing else.
- **Full docker stack** (`docker/docker-compose.yml`): the `minio-setup` sidecar
  creates the bucket. Ephemeral blobs are private + app-proxied, so no public
  policy is needed for them.
- **DigitalOcean Spaces:** the existing `SPACES_*` prod env is sufficient. The
  lifecycle rule is applied automatically at startup (idempotent, non-fatal, and
  merged so it never drops an operator's backups rule).

## Without object storage

Small games are unaffected (values publish inline). Only a genuinely oversized
value fails, with a clear message. A storage-free chunk-transport fallback (split
a big value across relay sub-addresses) is a possible future addition; not built.

## Testing

- `packages/engine/src/blob.test.ts` - offload/resolve/inline/no-storage/retry, and
  `claspEncodedSize` (numbers at 9 bytes), asserted against CLASP's **real**
  `encodeFrame` ceiling.
- `packages/engine/src/room-offload.integration.test.ts` - the exact Doodle Chain
  bug (30 drawings, over the ceiling) fixed at `finish()` through the real wrapper,
  plus the no-storage graceful-degrade path.
- `apps/web/server/utils/storage.test.ts` - lifecycle merge (no clobber), key
  scoping + sanitization, content-type extension mapping.
- `apps/web/server/utils/storage.s3.test.ts` (opt-in, `DOOT_S3=1`) - against real
  MinIO: signed PUT stores a **private** object, signed GET reads it back, the
  object is **not** anonymously readable, and the lifecycle PUT is accepted +
  idempotent. Run: `docker compose -f docker/docker-compose.yml up -d minio` then
  `DOOT_S3=1 pnpm vitest run apps/web/server/utils/storage.s3.test.ts`.
- `scripts/doodlechain-offload-smoke.mjs` - the whole thing end to end in a real
  browser: a 3-player Doodle Chain with dense drawings produces a ~96 KB results
  recap (over the 65535 ceiling), the host offloads it (POST to the app) instead of
  throwing, and a phone resolves the reference (GET the app) and renders the full
  gallery. Needs a dev server with storage configured (see the script header).
