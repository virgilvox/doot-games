/**
 * Capture unhandled SERVER errors into the observability ring (see
 * server/utils/observability.ts). Only real failures (5xx / uncaught) are recorded;
 * expected 4xx `createError`s (401/403/404/429 etc.) are normal control flow, not
 * breakage, so they're skipped. Mirrors the auth-migrate/backup server-plugin shape.
 */
import { recordError } from '../utils/observability'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, ctx) => {
    const status = Number((error as { statusCode?: number }).statusCode) || 500
    if (status < 500) return
    const event = (ctx as { event?: { method?: string; path?: string } } | undefined)?.event
    recordError({
      source: 'server',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      context: event ? { method: event.method, path: event.path, status } : { status },
    })
  })
})
