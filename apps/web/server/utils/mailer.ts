/**
 * Outbound transactional email (today: password-reset links only).
 *
 * One `fetch` to Resend's HTTP API, no SDK. HTTP rather than SMTP because
 * DigitalOcean blocks outbound SMTP ports on droplets by default. Configure with:
 *
 *   RESEND_API_KEY   the Resend API key (required to send)
 *   MAIL_FROM        sender, default `Doot <no-reply@doot.games>`; the domain must
 *                    be verified in Resend (SPF/DKIM records on its DNS)
 *
 * With no key set, nothing is sent. In development the message is printed to the
 * server console instead, so the reset flow is testable locally without an account.
 * Never log recipients or message bodies in production: they carry email addresses
 * and live reset links.
 */

export interface MailMessage {
  to: string
  subject: string
  text: string
  html: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'Doot <no-reply@doot.games>'

export function isMailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim()
}

/** Send one email. Throws on a delivery failure (callers decide whether to surface it). */
export async function sendMail(msg: MailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim()
  if (!key) {
    if (process.env.NODE_ENV === 'development') {
      console.info(`[doot] (dev, no RESEND_API_KEY) email to ${msg.to}: ${msg.subject}\n${msg.text}`)
      return
    }
    throw new Error('Email is not configured (RESEND_API_KEY is unset).')
  }
  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    // Resend's error body names the problem (bad key, unverified domain) and
    // never echoes the recipient, so it is safe to surface in the log.
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`Resend rejected the email (${res.status}): ${detail}`)
  }
}
