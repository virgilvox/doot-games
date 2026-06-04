/** Copy a deck into the requester's library (your own, or any `remixable` deck you
 *  can see). The copy starts private + non-remixable. Returns the new deck id. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const { id: newId } = await cloneDeck(id, user.id)
  setResponseStatus(event, 201)
  return { id: newId }
})
