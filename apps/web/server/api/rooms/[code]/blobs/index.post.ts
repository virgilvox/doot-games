import { randomUUID } from 'node:crypto'
import {
  EPHEMERAL_CONTENT_TYPES,
  type EphemeralContentType,
  EPHEMERAL_MAX_BYTES,
  ephemeralExt,
  ephemeralObjectKey,
  isStorageConfigured,
  putEphemeralObject,
} from '../../../../utils/storage'

/**
 * Store an EPHEMERAL play blob (a relay value too big for one CLASP frame: a
 * results filmstrip, a vote gallery, a photo answer). The browser POSTs the raw
 * bytes to this same-origin route and the APP writes them to object storage with a
 * signed PUT (see docs/ephemeral-blobs.md). Proxying the write (rather than a direct
 * browser upload) means: a real server-enforced size cap, no browser->storage CORS,
 * no public objects, and no presigned POST, all of which are unreliable on
 * DigitalOcean Spaces. Anonymous (players have no account) but size-capped,
 * content-type-restricted, unguessable-keyed, and rate-limited (see rate-limit.ts).
 */
export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code || !/^[A-Za-z0-9]{4}$/.test(code)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid room code.' })
  }
  if (!isStorageConfigured()) {
    throw createError({ statusCode: 501, statusMessage: 'Ephemeral storage is not configured.' })
  }
  const contentType = (getHeader(event, 'content-type') || '').split(';')[0]?.trim() || ''
  if (!(EPHEMERAL_CONTENT_TYPES as readonly string[]).includes(contentType)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported blob type.' })
  }
  // Reject before reading if the DECLARED size is over the cap (fast path).
  const declared = Number(getHeader(event, 'content-length') || 0)
  if (declared > EPHEMERAL_MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Blob is too large.' })

  // Read with a hard byte cap so a chunked body with no content-length cannot
  // stream unbounded into memory (a DoS on a small droplet). Memory is bounded to
  // the cap regardless of what the client sends.
  const body = await readCappedBody(event, EPHEMERAL_MAX_BYTES)
  if (body.length === 0) throw createError({ statusCode: 400, statusMessage: 'Empty blob.' })

  const id = `${randomUUID()}.${ephemeralExt(contentType as EphemeralContentType)}`
  await putEphemeralObject(ephemeralObjectKey(code, id), contentType, body)
  // The client stores this same-origin URL as the blob reference and GETs it to resolve.
  return { url: `/api/rooms/${code}/blobs/${id}` }
})

/**
 * Read the request body into memory but never keep more than `max` bytes: once the
 * running total exceeds the cap we stop accumulating and drain the rest to nowhere,
 * so an unbounded chunked upload (no Content-Length) can't exhaust memory. Reads the
 * Node request stream directly to avoid the web-stream reader's cancel/close pitfalls.
 */
function readCappedBody(event: { node: { req: NodeJS.ReadableStream } }, max: number): Promise<Uint8Array> {
  const req = event.node.req
  return new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let over = false
    let settled = false
    const finish = (err: unknown, buf?: Uint8Array) => {
      if (settled) return
      settled = true
      req.removeListener('data', onData)
      req.removeListener('end', onEnd)
      req.removeListener('error', onErr)
      if (err) reject(err)
      else resolve(buf as Uint8Array)
    }
    const onData = (chunk: Buffer) => {
      if (over) return // past the cap: keep draining but hold no more memory
      total += chunk.length
      if (total > max) {
        over = true
        return
      }
      chunks.push(chunk)
    }
    const onEnd = () => {
      if (over) finish(createError({ statusCode: 413, statusMessage: 'Blob is too large.' }))
      else finish(null, new Uint8Array(Buffer.concat(chunks)))
    }
    const onErr = (e: Error) => finish(e)
    req.on('data', onData)
    req.on('end', onEnd)
    req.on('error', onErr)
  })
}
