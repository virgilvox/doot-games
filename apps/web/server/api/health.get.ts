/**
 * Liveness probe. Intentionally cheap and dependency-free (no DB hit): a 200
 * here means Nitro is up and serving, which is what the container HEALTHCHECK
 * and Caddy's startup gating need. Deeper readiness checks would risk flapping
 * the proxy on a transient DB blip.
 */
export default defineEventHandler(() => ({ status: 'ok' }))
