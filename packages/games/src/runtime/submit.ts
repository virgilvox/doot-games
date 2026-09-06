/**
 * When a player may lock an answer in, and what shape their in-progress input
 * should have. Pure, so it can be tested; `GamePlayer.vue` is the only caller
 * that matters, plus the one custom-flow game that reimplemented the gate.
 *
 * The rule that matters here is a NEGATIVE one: submitting is not gated on the
 * host being present. It used to be, and that is what broke room Z2CP. Two
 * reasons it was wrong:
 *
 *  1. It disagreed with the rest of the runtime. When a round closes with an
 *     un-locked pick, `GamePlayer` submits it for the player anyway, with no
 *     host-presence check at all. So the same input the button refused to send
 *     went through a second later by another path. A gate half the code ignores
 *     is not a gate, it is a bug with a UI.
 *  2. It is not what host presence means. An input is a publish to the relay,
 *     which retains it. The host reads it whenever it looks, including after a
 *     reconnect. Nothing about a locked-in answer needs the host to be watching
 *     at that instant.
 *
 * The host being away is worth SAYING (the player should know the big screen is
 * not moving), so it stays a notice. It just no longer takes the button away.
 */

/** The minimum of a block this module needs. Keeps the module free of Vue. */
export interface SubmitGateBlock {
  isComplete?: (content: never, value: never) => boolean
  emptyInput: (content: never) => unknown
}

/**
 * Whether "Lock it in" should be tappable: we have a round to answer and the
 * player's input satisfies the block's own completeness rule. A block with no
 * `isComplete` accepts anything.
 */
export function canSubmitInput(
  block: SubmitGateBlock | undefined,
  content: unknown,
  value: unknown,
): boolean {
  if (!block || content == null) return false
  if (!block.isComplete) return true
  try {
    return !!block.isComplete(content as never, value as never)
  } catch {
    // A block whose isComplete assumes a different input shape than the one we
    // hold (secret per-player content arriving after the shared content flipped
    // the round's mode) must not wedge the button shut. Treat it as incomplete
    // and let `inputNeedsRebuild` swap the shape in on the next tick.
    return false
  }
}

/**
 * Whether an in-progress input was built for a DIFFERENT content shape and has
 * to be rebuilt.
 *
 * A round's content can change under the player mid-round: a two-phase round's
 * options are derived at runtime, and a hidden-role round delivers secret
 * per-player content to its own address, which arrives in its own time. Some
 * blocks branch their `emptyInput` on that content (doodle on `mode`, wavelength
 * on `phase`), so an input built from the shared content can be the wrong shape
 * entirely once the private content lands, and `isComplete` then never passes.
 *
 * Comparing the KEYS rather than rebuilding on every content change matters: a
 * blind rebuild would throw away a half-finished drawing every time the relay
 * redelivered a value.
 */
export function inputNeedsRebuild(
  block: SubmitGateBlock | undefined,
  content: unknown,
  value: unknown,
): boolean {
  if (!block || content == null) return false
  if (value == null || typeof value !== 'object') return true
  let fresh: unknown
  try {
    fresh = block.emptyInput(content as never)
  } catch {
    return false
  }
  if (fresh == null || typeof fresh !== 'object') return false
  const want = Object.keys(fresh as object).sort()
  const have = Object.keys(value as object).sort()
  return want.length !== have.length || want.some((k, i) => k !== have[i])
}
