/**
 * Shared content-schema helpers reused across blocks.
 *
 * Keeping these here means a cap like the prompt length lives in exactly one
 * place: the block schema (editor validation), the auto-generated form's
 * `maxlength`, and the markdown parser's clamp all read the same constant.
 */
import { z } from 'zod'

/**
 * Upper bound on a round prompt, in characters. The host stage scales the
 * prompt font down by length, but past ~600 chars a prompt scrolls past the
 * control bar (the column `overflow` was removed so the selected answer's glow
 * is not clipped). 400 leaves room for a paragraph-length question while
 * keeping it inside the smallest, well-tested font tier.
 */
export const PROMPT_MAX = 400

/** A round-prompt string field: a sensible default plus the shared length cap. */
export function promptText(defaultText: string) {
  return z.string().max(PROMPT_MAX).default(defaultText)
}
