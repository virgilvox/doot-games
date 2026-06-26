/**
 * File a post-game content report. Anonymous (players hit the results screen without
 * an account), but rate-limited via the rate-limit middleware (its own `rep:` bucket)
 * and size-capped by the schema here, so it can't be used to flood the moderation
 * queue. Returns 204.
 */
import { createReport, reportInputSchema } from '../utils/reports-repo'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = reportInputSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid report.' })
  }
  await createReport(parsed.data)
  setResponseStatus(event, 204)
  return null
})
