import { z } from '@doot-games/sdk'

const patchSchema = z.object({ visibility: z.enum(['private', 'unlisted', 'public']) })

/** Update a saved game's visibility — owner only. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const parsed = patchSchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid visibility' })
  const updated = await updateGameVisibility(id, user.id, parsed.data.visibility)
  if (!updated) throw createError({ statusCode: 404, statusMessage: 'Game not found' })
  return { ok: true, visibility: parsed.data.visibility }
})
