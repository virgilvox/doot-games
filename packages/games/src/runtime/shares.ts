/**
 * Play-time variables: turn a `collect` round's shares into a value a LATER round can
 * use (the "collected media becomes a variable" idea). A collect round's inputs are
 * `{ media?, text? }` per player; this picks one for a `RoundInstance.fromShares`
 * binding, resolved at round-advance by `buildDeriveContent` (never at load time, since
 * the shares aren't known until that round runs).
 *
 * MVP scope: a single value into a single field (e.g. an `image`). Whole runtime
 * "share decks" (draw N collected rows, bind several fields) are a later step; see
 * docs/decks-roadmap.md §2.5.
 */
export interface ShareInput {
  media?: string
  text?: string
}

/** The non-empty share values of one kind, in player order. */
export function shareValues(inputs: Map<string, ShareInput>, value: 'media' | 'text'): string[] {
  const out: string[] = []
  for (const v of inputs.values()) {
    const s = value === 'text' ? v?.text : v?.media
    if (typeof s === 'string' && s.length > 0) out.push(s)
  }
  return out
}

/**
 * Pick one shared value from a collect round's inputs. `first` is the first submission
 * (player order); `random` uses the provided seeded shuffle so a room is deterministic
 * across reconnects. Returns undefined when nobody shared (the caller keeps the
 * authored placeholder).
 */
export function pickShare(
  inputs: Map<string, ShareInput>,
  value: 'media' | 'text',
  pick: 'random' | 'first',
  shuffle: <T>(items: T[]) => T[],
): string | undefined {
  const vals = shareValues(inputs, value)
  if (vals.length === 0) return undefined
  return pick === 'first' ? vals[0] : shuffle(vals)[0]
}
