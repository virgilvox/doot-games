import { ephemeralObjectKey, getEphemeralObject } from '../../../../utils/storage'

/**
 * Read an ephemeral play blob back. The object is PRIVATE in storage; the app reads
 * it with a signed GET and streams the bytes back same-origin, so there is no public
 * object and no browser->storage CORS (see docs/ephemeral-blobs.md). The id is
 * validated against a strict pattern (server-chosen uuid + known extension) so it
 * cannot escape the room's `ephemeral/<code>/` prefix or inject S3 request syntax.
 */
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(json|png|jpg|webp)$/

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  const id = getRouterParam(event, 'id')
  if (!code || !/^[A-Za-z0-9]{4}$/.test(code)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid room code.' })
  }
  if (!id || !ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid blob id.' })
  }
  const obj = await getEphemeralObject(ephemeralObjectKey(code, id))
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Blob not found or expired.' })

  setHeader(event, 'content-type', obj.contentType)
  // Immutable content at an unguessable key; a short private cache is safe and cuts
  // repeat storage reads when several phones resolve the same results.
  setHeader(event, 'cache-control', 'private, max-age=300')
  return obj.body
})
