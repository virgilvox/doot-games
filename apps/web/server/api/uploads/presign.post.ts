import { z } from '@doot-games/sdk'

const presignSchema = z.object({
  contentType: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
})

/** Presign a direct browser upload. Requires a session (uploads are durable). */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (!isStorageConfigured()) {
    throw createError({ statusCode: 501, statusMessage: 'Uploads are not configured.' })
  }
  const parsed = presignSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported image type.' })
  }
  const ext = extensionFor(parsed.data.contentType)
  if (!ext) throw createError({ statusCode: 400, statusMessage: 'Unsupported image type.' })
  const key = `uploads/${user.id}/${crypto.randomUUID()}.${ext}`
  return presignUpload(key, parsed.data.contentType)
})
