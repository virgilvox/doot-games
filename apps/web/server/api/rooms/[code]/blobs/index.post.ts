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
  // Reject before reading if the declared size is over the cap.
  const declared = Number(getHeader(event, 'content-length') || 0)
  if (declared > EPHEMERAL_MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Blob is too large.' })

  const raw = await readRawBody(event, false)
  const body = raw ? new Uint8Array(raw) : null
  if (!body || body.length === 0) throw createError({ statusCode: 400, statusMessage: 'Empty blob.' })
  // Enforce the real size server-side (content-length can be omitted/spoofed).
  if (body.length > EPHEMERAL_MAX_BYTES) throw createError({ statusCode: 413, statusMessage: 'Blob is too large.' })

  const id = `${randomUUID()}.${ephemeralExt(contentType as EphemeralContentType)}`
  await putEphemeralObject(ephemeralObjectKey(code, id), contentType, body)
  // The client stores this same-origin URL as the blob reference and GETs it to resolve.
  return { url: `/api/rooms/${code}/blobs/${id}` }
})
