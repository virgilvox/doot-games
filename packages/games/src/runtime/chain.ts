/**
 * Pipeline rotation (P7): the pure math for a per-player CHAIN (the Gartic Phone /
 * "telephone" shape), built on the per-player content primitive (a block's
 * `assignContent` reading a prior round's inputs via `sources`).
 *
 * A chain seats every participant in a fixed ring. Round 0 is the seed round
 * (everyone starts their own thread). Each later round the threads rotate one seat:
 * you receive the thing your LEFT neighbor made last round and build on it, so each
 * thread visits every player exactly once. At the end the threads are "unspooled"
 * to show how each one mutated from prompt -> drawing -> guess -> ...
 *
 * Everything here is pure and deterministic so it is reconnect-safe: given the same
 * SET of participant ids and the same seeded shuffle, every client (and a
 * reconnecting host) computes the identical ring and the identical assignments. The
 * caller is responsible for handing in a STABLE participant set (frozen at game
 * start), since a changing set would re-order the ring; this module assumes the set
 * it is given is final.
 */

/**
 * The fixed, ordered ring of chain participants. The input pids are sorted to a
 * canonical order FIRST (so the result depends only on the set, not on whatever
 * order the roster happened to arrive in), then shuffled with the supplied shuffle.
 *
 * Pass a ROOM-STABLE shuffle (one seed for the whole game, e.g.
 * `seededShuffle(room + ':chain')`) or the identity `(x) => x` for plain sorted
 * seating. Do NOT pass a per-ROUND shuffle: the ring must be identical every round
 * or the rotation scrambles. (A block's `assignContent` is handed a per-index
 * shuffle, which is right for a hidden role but wrong for a chain ring; derive the
 * ring from a stable seed instead.) Pure.
 */
export function chainOrder(pids: string[], shuffle: <T>(items: T[]) => T[]): string[] {
  return shuffle([...new Set(pids)].sort())
}

/**
 * Whose round `roundIndex - 1` output player `pid` builds on in `roundIndex`:
 * - round 0 (the seed round): the player's own id (everyone starts their own thread);
 * - round >= 1: the player's LEFT neighbor in the ring (one seat back).
 * Because each round derives only from the immediately prior round and the ring is
 * fixed, the source is always the left neighbor; the thread that reaches you is a
 * different one each round (it has travelled `roundIndex - 1` seats). Returns
 * undefined if `pid` is not in the ring. Pure.
 */
export function chainSourceFor(
  order: string[],
  roundIndex: number,
  pid: string,
): string | undefined {
  const n = order.length
  if (n === 0) return undefined
  const pos = order.indexOf(pid)
  if (pos < 0) return undefined
  if (roundIndex <= 0) return pid
  return order[(pos - 1 + n) % n]
}

/** One step of an unspooled thread: the round, who held it, and what they made. */
export interface ChainStep {
  roundIndex: number
  pid: string
  input: unknown
}

/**
 * Reconstruct every thread for the end-of-game "unspool" reveal. Thread `k`
 * (originated by `order[k]` in round 0) is the paper as it travels the ring: round
 * 0 by `order[k]`, round 1 by `order[k + 1]`, ... round r by `order[(k + r) % n]`.
 * `inputsByRound[r]` is a map of pid -> that player's round-`r` input. The returned
 * threads are in origin order (thread `k` started by `order[k]`); each step's
 * `input` is `undefined` if that player never submitted that round. Pure.
 */
export function chainThreads(
  order: string[],
  inputsByRound: Array<Map<string, unknown>>,
): ChainStep[][] {
  const n = order.length
  const rounds = inputsByRound.length
  const threads: ChainStep[][] = []
  for (let k = 0; k < n; k++) {
    const thread: ChainStep[] = []
    for (let r = 0; r < rounds; r++) {
      const pid = order[(k + r) % n] as string
      thread.push({ roundIndex: r, pid, input: inputsByRound[r]?.get(pid) })
    }
    threads.push(thread)
  }
  return threads
}
