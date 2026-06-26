/**
 * Sink for client-reported errors (see app/plugins/error-track.client.ts). Anonymous
 * (players hit errors without an account), but rate-limited via the rate-limit
 * middleware and size-capped here, so it can't be used to flood the ring. Records
 * into the observability store; returns 204.
 */
import { recordError } from '../utils/observability'

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) as Record<string, unknown> | null
  const message = str(body?.message, 500)
  if (!message) throw createError({ statusCode: 400, statusMessage: 'Invalid error report.' })
  recordError({
    source: 'client',
    message,
    stack: str(body?.stack, 4000),
    context: { url: str(body?.url, 300), kind: str(body?.kind, 40) },
  })
  setResponseStatus(event, 204)
  return null
})
