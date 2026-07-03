/**
 * Opt-in integration test for ephemeral blobs against a REAL S3-compatible store
 * (local MinIO). Skipped unless DOOT_S3=1, like the DOOT_LIVE relay test, so the
 * normal suite stays offline. This proves the two Spaces paths the design relies on
 * work end to end: a signed PUT stores a PRIVATE object, a signed GET reads it back
 * (no public object, no browser CORS), and the lifecycle PUT is accepted + idempotent.
 *
 *   docker compose -f docker/docker-compose.yml up -d minio
 *   DOOT_S3=1 pnpm vitest run apps/web/server/utils/storage.s3.test.ts
 */
import { AwsClient } from 'aws4fetch'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ensureEphemeralLifecycle, ephemeralObjectKey, getEphemeralObject, putEphemeralObject } from './storage'

const RUN = process.env.DOOT_S3 === '1'
const ENDPOINT = process.env.SPACES_ENDPOINT || 'http://localhost:9000'
const BUCKET = process.env.SPACES_BUCKET || 'doot'
const KEY = process.env.SPACES_KEY || 'minioadmin'
const SECRET = process.env.SPACES_SECRET || 'minioadmin'

const saved: Record<string, string | undefined> = {}
const ENV = ['SPACES_ENDPOINT', 'SPACES_REGION', 'SPACES_BUCKET', 'SPACES_KEY', 'SPACES_SECRET', 'SPACES_PUBLIC_URL']

describe.skipIf(!RUN)('ephemeral blobs against real S3 (DOOT_S3=1)', () => {
  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k]
    process.env.SPACES_ENDPOINT = ENDPOINT
    process.env.SPACES_REGION = 'us-east-1'
    process.env.SPACES_BUCKET = BUCKET
    process.env.SPACES_KEY = KEY
    process.env.SPACES_SECRET = SECRET
    process.env.SPACES_PUBLIC_URL = `${ENDPOINT}/${BUCKET}`
    // Create the bucket (ignore "already exists").
    const c = new AwsClient({ accessKeyId: KEY, secretAccessKey: SECRET, region: 'us-east-1', service: 's3' })
    await c.fetch(`${ENDPOINT}/${BUCKET}`, { method: 'PUT' }).catch(() => undefined)
  })

  afterAll(() => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('signed PUT stores a private object; signed GET reads it back', async () => {
    const key = ephemeralObjectKey('TEST', `${crypto.randomUUID()}.json`)
    const payload = JSON.stringify({ hello: 'ephemeral', threads: [1, 2, 3] })
    await putEphemeralObject(key, 'application/json', new TextEncoder().encode(payload))

    const got = await getEphemeralObject(key)
    expect(got).not.toBeNull()
    expect(new TextDecoder().decode(got?.body)).toBe(payload)
    expect(got?.contentType).toContain('application/json')
  })

  it('the object is NOT anonymously readable (private)', async () => {
    const key = ephemeralObjectKey('TEST', `${crypto.randomUUID()}.json`)
    await putEphemeralObject(key, 'application/json', new TextEncoder().encode('{"secret":true}'))
    // A plain (unsigned) GET must be denied for a private object.
    const anon = await fetch(`${ENDPOINT}/${BUCKET}/${key}`)
    expect(anon.status).toBeGreaterThanOrEqual(400)
  })

  it('getEphemeralObject returns null for a missing key', async () => {
    const missing = await getEphemeralObject(ephemeralObjectKey('TEST', `${crypto.randomUUID()}.json`))
    expect(missing).toBeNull()
  })

  it('applies the lifecycle rule and is idempotent', async () => {
    const first = await ensureEphemeralLifecycle()
    expect(['created', 'merged', 'exists']).toContain(first)
    const second = await ensureEphemeralLifecycle()
    expect(second).toBe('exists')
  })
})
