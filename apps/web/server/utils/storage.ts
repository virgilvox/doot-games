/**
 * Object storage for uploaded images, presigned PUT to an S3-compatible store
 * (DigitalOcean Spaces in prod, MinIO locally). Browsers upload directly to the
 * store via the presigned URL; the app only signs. Configured by env:
 *   SPACES_ENDPOINT, SPACES_REGION, SPACES_BUCKET, SPACES_KEY, SPACES_SECRET,
 *   SPACES_PUBLIC_URL (optional; defaults to <endpoint>/<bucket>).
 * With none set, uploads are simply disabled and the editor falls back to URL.
 */
import { createHash } from 'node:crypto'
import { AwsClient } from 'aws4fetch'

interface StorageConfig {
  endpoint: string
  region: string
  bucket: string
  accessKey: string
  secretKey: string
  publicBase: string
}

function readConfig(): StorageConfig | null {
  const endpoint = process.env.SPACES_ENDPOINT?.replace(/\/$/, '')
  const bucket = process.env.SPACES_BUCKET
  const accessKey = process.env.SPACES_KEY
  const secretKey = process.env.SPACES_SECRET
  if (!endpoint || !bucket || !accessKey || !secretKey) return null
  const publicBase = (process.env.SPACES_PUBLIC_URL || `${endpoint}/${bucket}`).replace(/\/$/, '')
  return { endpoint, region: process.env.SPACES_REGION || 'us-east-1', bucket, accessKey, secretKey, publicBase }
}

export function isStorageConfigured(): boolean {
  return readConfig() !== null
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function extensionFor(contentType: string): string | null {
  return EXT[contentType] ?? null
}

export interface PresignedUpload {
  /** The presigned URL the browser PUTs the file to. */
  uploadUrl: string
  /** The public URL the saved image will be readable at. */
  publicUrl: string
  /** Headers the browser must send on the PUT to match the signature. */
  headers: Record<string, string>
}

function awsClient(cfg: StorageConfig): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKey,
    secretAccessKey: cfg.secretKey,
    region: cfg.region,
    service: 's3',
  })
}

/** Presign a direct browser PUT for `objectKey`. */
export async function presignUpload(objectKey: string, contentType: string): Promise<PresignedUpload> {
  const cfg = readConfig()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Uploads are not configured.' })
  const objectUrl = `${cfg.endpoint}/${cfg.bucket}/${objectKey}`
  const headers = { 'content-type': contentType, 'x-amz-acl': 'public-read' }
  const signed = await awsClient(cfg).sign(objectUrl, { method: 'PUT', headers, aws: { signQuery: true } })
  return { uploadUrl: signed.url, publicUrl: `${cfg.publicBase}/${objectKey}`, headers }
}

/**
 * Server-side upload: sign and PUT the bytes ourselves (used by the MCP
 * `upload_image` tool, which fetches an image and re-hosts it). Returns the public
 * URL. Browsers use {@link presignUpload} instead so bytes never pass through us.
 */
export async function uploadObject(objectKey: string, contentType: string, body: Uint8Array): Promise<string> {
  const cfg = readConfig()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Uploads are not configured.' })
  const objectUrl = `${cfg.endpoint}/${cfg.bucket}/${objectKey}`
  const res = await awsClient(cfg).fetch(objectUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-amz-acl': 'public-read' },
    // Uint8Array is a valid fetch body at runtime; cast past the lib's stricter BodyInit.
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Storage upload failed (${res.status}).` })
  return `${cfg.publicBase}/${objectKey}`
}

/**
 * Server-side upload of a PRIVATE object (never `public-read`). Used for database
 * backups, which contain account emails + password hashes and must not be world-
 * readable. The object is read back only via a signed request (e.g.
 * `scripts/restore-db.mjs`). Throws if storage isn't configured.
 */
export async function uploadPrivateObject(objectKey: string, contentType: string, body: Uint8Array): Promise<void> {
  const cfg = readConfig()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Storage is not configured.' })
  const objectUrl = `${cfg.endpoint}/${cfg.bucket}/${objectKey}`
  const res = await awsClient(cfg).fetch(objectUrl, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-amz-acl': 'private' },
    // Uint8Array is a valid fetch body at runtime; cast past the lib's stricter BodyInit.
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Backup upload failed (${res.status}).` })
}

// ── Ephemeral blobs (Claim-Check offload for oversized relay values) ──────────
// See docs/ephemeral-blobs.md. Anonymous players (no account) offload a value too
// big for one CLASP frame here; it self-expires via a bucket lifecycle rule.

/** Object-storage prefix for ephemeral play blobs; the lifecycle rule targets it. */
export const EPHEMERAL_PREFIX = 'ephemeral/'
/** Days after which an ephemeral object is deleted (S3 lifecycle minimum is 1). */
export const EPHEMERAL_EXPIRE_DAYS = 1
/** Hard per-object size cap, enforced server-side by the POST policy. */
export const EPHEMERAL_MAX_BYTES = 5 * 1024 * 1024
/** The only content types an ephemeral upload may claim (blocks HTML/script hosting). */
export const EPHEMERAL_CONTENT_TYPES = ['application/json', 'image/png', 'image/jpeg', 'image/webp'] as const
export type EphemeralContentType = (typeof EPHEMERAL_CONTENT_TYPES)[number]

const EPHEMERAL_EXT: Record<EphemeralContentType, string> = {
  'application/json': 'json',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** The file extension for an allowed content type. */
export function ephemeralExt(contentType: EphemeralContentType): string {
  return EPHEMERAL_EXT[contentType]
}

/**
 * The private object key for an ephemeral blob, scoped to the room. `id` is the
 * server-chosen `<uuid>.<ext>`. Both segments are sanitized so a hostile room code
 * or id cannot escape the `ephemeral/` prefix or inject S3 request syntax; callers
 * MUST additionally validate `id` against a strict pattern (the read route does).
 */
export function ephemeralObjectKey(roomCode: string, id: string): string {
  const safeRoom = roomCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)
  // Strip anything but the allowed id chars, then collapse dot runs so no `..` can
  // survive (belt-and-suspenders; the read route also strict-validates the id).
  const safeId = id.replace(/[^A-Za-z0-9._-]/g, '').replace(/\.{2,}/g, '.')
  return `${EPHEMERAL_PREFIX}${safeRoom}/${safeId}`
}

/**
 * Store an ephemeral blob (private). The bytes flow app -> storage via a signed PUT,
 * the same proven path the image re-host + backups use, so it needs no bucket CORS,
 * no public objects, and no presigned-POST (all shaky on DigitalOcean Spaces). See
 * docs/ephemeral-blobs.md for why the app proxies these instead of a direct browser
 * upload.
 */
export async function putEphemeralObject(objectKey: string, contentType: string, body: Uint8Array): Promise<void> {
  const cfg = readConfig()
  if (!cfg) throw createError({ statusCode: 501, statusMessage: 'Ephemeral storage is not configured.' })
  const res = await awsClient(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}/${objectKey}`, {
    method: 'PUT',
    headers: { 'content-type': contentType, 'x-amz-acl': 'private' },
    body: body as unknown as BodyInit,
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Ephemeral upload failed (${res.status}).` })
}

/** Read an ephemeral blob back via a signed GET (the object is private). Null on 404. */
export async function getEphemeralObject(objectKey: string): Promise<{ body: Uint8Array; contentType: string } | null> {
  const cfg = readConfig()
  if (!cfg) return null
  const res = await awsClient(cfg).fetch(`${cfg.endpoint}/${cfg.bucket}/${objectKey}`, { method: 'GET' })
  if (res.status === 404 || res.status === 403) return null
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: `Ephemeral read failed (${res.status}).` })
  return {
    body: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  }
}

const EPHEMERAL_RULE_ID = 'doot-ephemeral-expiry'

/**
 * Merge the ephemeral-expiry rule into a bucket's lifecycle config WITHOUT clobbering
 * any existing rules (e.g. an operator's manual backups-expiry rule). Pure + tested:
 * returns the XML to PUT and whether anything changed. Idempotent by rule ID.
 */
export function buildEphemeralLifecycleXml(existing: string | null): { xml: string; changed: boolean } {
  const rule =
    `<Rule><ID>${EPHEMERAL_RULE_ID}</ID><Filter><Prefix>${EPHEMERAL_PREFIX}</Prefix></Filter>` +
    `<Status>Enabled</Status><Expiration><Days>${EPHEMERAL_EXPIRE_DAYS}</Days></Expiration></Rule>`
  const trimmed = existing?.trim()
  if (!trimmed || !trimmed.includes('<LifecycleConfiguration')) {
    return { xml: `<LifecycleConfiguration>${rule}</LifecycleConfiguration>`, changed: true }
  }
  if (trimmed.includes(`<ID>${EPHEMERAL_RULE_ID}</ID>`)) return { xml: trimmed, changed: false }
  return { xml: trimmed.replace('</LifecycleConfiguration>', `${rule}</LifecycleConfiguration>`), changed: true }
}

/**
 * Ensure the bucket expires ephemeral objects on its own (the "T" in TTL). Reads any
 * existing lifecycle config and merges the ephemeral rule in, so it never removes an
 * operator's other rules. Idempotent; safe to run at every startup. Both MinIO and
 * DigitalOcean Spaces support the S3 lifecycle API, so dev matches prod.
 */
export async function ensureEphemeralLifecycle(): Promise<'created' | 'merged' | 'exists' | 'skipped'> {
  const cfg = readConfig()
  if (!cfg) return 'skipped'
  const client = awsClient(cfg)
  const url = `${cfg.endpoint}/${cfg.bucket}?lifecycle`

  let existing: string | null = null
  const get = await client.fetch(url, { method: 'GET' })
  if (get.ok) existing = await get.text()
  else if (get.status !== 404) throw createError({ statusCode: 502, statusMessage: `Lifecycle read failed (${get.status}).` })

  const built = buildEphemeralLifecycleXml(existing)
  if (!built.changed) return 'exists'

  // S3 requires a Content-MD5 on PutBucketLifecycleConfiguration.
  const md5 = createHash('md5').update(built.xml).digest('base64')
  const put = await client.fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/xml', 'content-md5': md5 },
    body: built.xml,
  })
  if (!put.ok) throw createError({ statusCode: 502, statusMessage: `Lifecycle write failed (${put.status}).` })
  return existing ? 'merged' : 'created'
}
