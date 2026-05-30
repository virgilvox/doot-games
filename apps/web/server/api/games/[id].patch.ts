import { z } from '@doot-games/sdk'

const patchSchema = z
  .object({
    visibility: z.enum(['private', 'unlisted', 'public']).optional(),
    forkable: z.boolean().optional(),
  })
  .refine((v) => v.visibility !== undefined || v.forkable !== undefined, 'Nothing to update')

/** Quick metadata toggles (visibility / forkable) - owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid update' })
  const updated = await patchGameMeta(id, user.id, parsed.data)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return { ok: true, ...parsed.data }
})
