/**
 * Password reset: the email, the link, and the per-address throttle. Pure (no I/O)
 * so it is unit-tested; auth.ts wires it into better-auth's `sendResetPassword`.
 *
 * Flow: /forgot-password -> POST /api/auth/request-password-reset -> better-auth
 * stores a single-use token (hashed at rest) for 1 hour and calls
 * sendResetPassword -> we email `<PUBLIC_BASE_URL>/reset-password#token=...` ->
 * the page POSTs /api/auth/reset-password { token, newPassword }.
 *
 * The token rides in the URL FRAGMENT, not the query string: a fragment is never
 * sent to any server, so it can't land in proxy logs, the Referer header, or the
 * analytics page path.
 */
import type { MailMessage } from './mailer'

/** How long a reset link works. Also better-auth's resetPasswordTokenExpiresIn. */
export const RESET_TOKEN_TTL_SECONDS = 60 * 60

/** The emailed link. `base` must be the configured public origin, never a request Host. */
export function buildResetUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, '')}/reset-password#token=${encodeURIComponent(token)}`
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** The reset email. Plain wording, no tracking pixels or third-party assets. */
export function resetEmail(to: string, url: string): MailMessage {
  const text = [
    'Someone asked to reset the password for your Doot account.',
    '',
    'Choose a new password here (the link works once, for 1 hour):',
    url,
    '',
    "If that wasn't you, ignore this email. Your password stays the same.",
    '',
    'Doot - https://doot.games',
  ].join('\n')
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f4ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d1b16">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px">
<p style="margin:0 0 16px;font-size:20px;font-weight:700">Reset your Doot password</p>
<p style="margin:0 0 20px;line-height:1.5">Someone asked to reset the password for your Doot account. The button works once, for 1 hour.</p>
<p style="margin:0 0 24px"><a href="${esc(url)}" style="display:inline-block;background:#1d1b16;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Choose a new password</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#5c574c;line-height:1.5">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(url)}</span></p>
<p style="margin:16px 0 0;font-size:13px;color:#5c574c;line-height:1.5">If that wasn't you, ignore this email. Your password stays the same.</p>
</div></body></html>`
  return { to, subject: 'Reset your Doot password', text, html }
}

/**
 * Per-address throttle on reset emails. better-auth already limits the endpoint
 * per IP (3/min), but that does nothing against many IPs flooding ONE inbox.
 * A throttled request is silently skipped: the response is identical either way,
 * so this can't be used to probe which emails have accounts.
 */
export class ResetThrottle {
  private sent = new Map<string, number[]>()

  constructor(
    private readonly cooldownMs = 60_000,
    private readonly maxPerHour = 5,
  ) {}

  /** Record and allow a send to `email` at `now`, or return false to skip it. */
  allow(email: string, now = Date.now()): boolean {
    const key = email.trim().toLowerCase()
    const recent = (this.sent.get(key) ?? []).filter((t) => now - t < 3_600_000)
    const last = recent[recent.length - 1]
    if ((last !== undefined && now - last < this.cooldownMs) || recent.length >= this.maxPerHour) {
      this.sent.set(key, recent)
      return false
    }
    recent.push(now)
    this.sent.set(key, recent)
    // Bound memory: drop addresses with nothing in the last hour.
    if (this.sent.size > 5_000) {
      for (const [k, ts] of this.sent) if (!ts.some((t) => now - t < 3_600_000)) this.sent.delete(k)
    }
    return true
  }
}
