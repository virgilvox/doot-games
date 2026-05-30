/**
 * The room runtime. This is the generic machinery every game shares, lifted out
 * of any single game: the CLASP wiring, the phase/round state machine, the
 * roster and presence, late-joiner eligibility, reconnect-by-name identity, the
 * host countdown auto-lock, and answer withholding. A game never touches the
 * relay or reimplements any of this; it reads reactive state and calls actions.
 *
 * The runtime is framework-agnostic: it keeps plain state, mutates it in
 * response to relay messages and local actions, and notifies listeners. The Vue
 * binding (`@doot-games/engine/vue`) mirrors this into refs.
 */
import {
  addr,
  parseInputAddress,
  parseRoundSubAddress,
  patterns,
  pidFromPlayerAddress,
} from './addresses'
import { computeJoinedAtIndex, isEligible } from './eligibility'
import { playerId } from './identity'
import { DEFAULT_TTL_US, type RelayClient, type RelayValue, type Unsubscribe } from './relay'
import {
  type HostAction,
  INITIAL_STATE,
  canTransition,
  reduce,
  shouldAutoLock,
} from './state-machine'
import type { Identity, Phase, Player, RoomMeta, RoomState, RoundState } from './types'

const PRESENCE_WINDOW_MS = 20_000
const HEARTBEAT_INTERVAL_MS = 5_000
// The host republishes a liveness ping on this cadence; players treat the host
// as gone once its last ping is older than the window (a few missed beats).
const HOST_HEARTBEAT_INTERVAL_MS = 5_000
const HOST_PRESENCE_WINDOW_MS = 16_000

/** Minimal per-round timing the runtime needs (the plugin derives the rest). */
export interface RoundTiming {
  /** Seconds before voting auto-locks, or null for no timer. */
  timer: number | null
}

/** The durable-per-room game definition the host loads before starting. */
export interface LoadedGame {
  meta: RoomMeta
  /** Full config (with answers). Kept locally for the host; never published as-is. */
  config: RelayValue
  /** Redacted config to publish to the relay. Defaults to `config` if omitted. */
  publishConfig?: RelayValue
  /** Per-round timing, used to compute deadlines on `open`. */
  rounds: RoundTiming[]
  /** Answer key per round index, published only at that round's reveal. */
  answerKeys?: Record<number, RelayValue>
  /**
   * Two-phase pattern: build round `index`'s content from earlier rounds' inputs.
   * Called by the host (only) when it lands on the round. Returns the anonymized
   * content to publish to the relay plus the withheld answer key (e.g. the author
   * map), or undefined for an ordinary static round. The engine never inspects the
   * payloads, it just publishes `publish` to the round's content address and folds
   * `answer` into the round's answer key (revealed at reveal like any other).
   */
  deriveContent?: (
    index: number,
    inputsFor: (i: number) => Map<string, RelayValue>,
  ) => { publish: RelayValue; answer?: RelayValue } | undefined
  /**
   * A public per-round reveal payload (vote tallies, the round winner) the host
   * computes from all inputs and publishes at `reveal`, so phones can show
   * personal feedback. Returns undefined to publish nothing.
   */
  revealSummary?: (
    index: number,
    inputsFor: (i: number) => Map<string, RelayValue>,
  ) => RelayValue | undefined
}

export interface RoomRuntimeOptions {
  relay: RelayClient
  room: string
  role: Identity['role']
  /** Required for players; ignored for host/viewer. */
  name?: string
  /** Injectable clock for tests; defaults to `Date.now`. */
  now?: () => number
  /** Absolute TTL (microseconds) on every published value. */
  ttlUs?: number
}

/** A read-only snapshot of live room state. */
export interface RoomSnapshot {
  phase: Phase
  round: RoomState['round']
  players: Player[]
  me: Identity
  config: RelayValue | undefined
  meta: RoomMeta | undefined
  results: RelayValue | undefined
  connected: boolean
  reconnecting: boolean
  error: string | null
  /** True once the first phase value has arrived from the relay. */
  ready: boolean
  /** First round index this client may act on (player only; 0 otherwise). */
  joinedAtIndex: number
  /** Whether the host's heartbeat is current (true for the host itself, and
   *  true before any ping is seen so the join screen doesn't flash "gone"). */
  hostPresent: boolean
}

type Listener = () => void

export class RoomRuntime {
  readonly room: string
  readonly me: Identity

  private relay: RelayClient
  private now: () => number
  private ttlUs: number

  private state: RoomState = { ...INITIAL_STATE, round: { ...INITIAL_STATE.round } }
  private playersMap = new Map<string, Player>()
  private inputs = new Map<string, RelayValue>() // key `${round}:${pid}`
  /** Runtime-derived content per round (two-phase). Host fills it on publish;
   *  player/viewer fill it from the relay. Overrides authored content. */
  private runtimeContent = new Map<number, RelayValue>()
  /** Public per-round reveal summaries, keyed by round index. */
  private roundReveals = new Map<number, RelayValue>()
  /** Host-only: the withheld answer key a runtime derivation produced (e.g. the
   *  author map for a vote round), so end-of-game scoring can read it. */
  private derivedAnswers = new Map<number, RelayValue>()
  private config: RelayValue | undefined
  private meta: RoomMeta | undefined
  private results: RelayValue | undefined

  private connected = false
  private reconnecting = false
  private error: string | null = null
  private ready = false
  private profilePublished = false
  private myJoinedAtIndex = 0
  /** Last host-ping timestamp seen (player/viewer only). */
  private lastHostPing: number | null = null

  private game: LoadedGame | null = null
  private unsubs: Unsubscribe[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private hostHeartbeatTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<Listener>()

  constructor(opts: RoomRuntimeOptions) {
    this.relay = opts.relay
    this.room = opts.room
    this.now = opts.now ?? Date.now
    this.ttlUs = opts.ttlUs ?? DEFAULT_TTL_US
    const name = opts.name ?? ''
    this.me = {
      role: opts.role,
      name,
      id: opts.role === 'player' ? playerId(opts.room, name) : `${opts.role}_${opts.room}`,
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  async connect(): Promise<void> {
    this.relay.onConnect(() => {
      this.connected = true
      this.reconnecting = false
      this.error = null
      this.emit()
    })
    this.relay.onDisconnect(() => {
      this.connected = false
      this.emit()
    })
    this.relay.onReconnect(() => {
      this.reconnecting = true
      this.emit()
    })
    this.relay.onError(() => {
      // Surface a friendly message; details go to the console at the call site.
      this.error = 'Lost the connection to the game relay.'
      this.emit()
    })
    await this.relay.connect()
    this.subscribe()
    // Seed connection state from the synchronous truth: onConnect may have
    // already fired (a shared relay can be connected before we register), in
    // which case the callback above never runs for this runtime.
    if (this.relay.connected) this.connected = true
    if (this.me.role === 'host') {
      // The host is authoritative; publish the lobby phase so early joiners
      // receive it on subscribe, and mark ourselves ready immediately.
      this.publish(addr.phase(this.room), 'lobby')
      this.ready = true
      // Publish meta now (if the game is already loaded) so lobby joiners learn
      // which game/theme is running and can render the waiting screen, without
      // it, a player can't resolve the plugin until start().
      this.publishMetaIfLoaded()
      // Start broadcasting host liveness so players can tell a live room from a
      // dead one and notice if the host's screen goes away mid-game.
      this.startHostHeartbeat()
    }
    this.emit()
  }

  private startHostHeartbeat(): void {
    if (this.me.role !== 'host' || this.hostHeartbeatTimer) return
    const beat = () => this.publish(addr.hostPing(this.room), this.now())
    beat()
    this.hostHeartbeatTimer = setInterval(beat, HOST_HEARTBEAT_INTERVAL_MS)
  }

  /** Publish room meta (game id, title, theme) so players can render the lobby. */
  private publishMetaIfLoaded(): void {
    if (this.me.role !== 'host' || !this.game) return
    this.meta = this.game.meta
    this.publish(addr.meta(this.room), this.game.meta as unknown as RelayValue)
  }

  /** Tear down subscriptions and timers. Does not close the shared relay. */
  dispose(): void {
    for (const u of this.unsubs) {
      try {
        u()
      } catch {
        /* ignore */
      }
    }
    this.unsubs = []
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
    if (this.hostHeartbeatTimer) clearInterval(this.hostHeartbeatTimer)
    this.hostHeartbeatTimer = null
    this.listeners.clear()
  }

  private subscribe(): void {
    const on = (pattern: string, cb: (v: RelayValue, a: string) => void) => {
      this.unsubs.push(this.relay.on(pattern, cb))
    }
    const r = this.room

    // Players and viewers read the host's authoritative state. The host is the
    // sole writer of these addresses and keeps them locally, so it does not
    // subscribe to its own writes.
    if (this.me.role !== 'host') {
      on(addr.phase(r), (v) => {
        const first = !this.ready
        this.state = { ...this.state, phase: v as Phase }
        this.ready = true
        if (first && this.me.role === 'player') void this.ensureProfilePublished()
        this.emit()
      })
      on(addr.meta(r), (v) => {
        this.meta = v as unknown as RoomMeta
        this.emit()
      })
      on(addr.config(r), (v) => {
        this.config = v
        this.emit()
      })
      on(addr.roundIndex(r), (v) => {
        this.state = { ...this.state, round: { ...this.state.round, index: Number(v) | 0 } }
        this.emit()
      })
      on(addr.roundState(r), (v) => {
        this.state = { ...this.state, round: { ...this.state.round, state: v as RoundState } }
        this.emit()
      })
      on(addr.roundDeadline(r), (v) => {
        this.state = {
          ...this.state,
          round: { ...this.state.round, deadline: v == null ? null : Number(v) },
        }
        this.emit()
      })
      on(addr.resultsSummary(r), (v) => {
        this.results = v
        this.emit()
      })
      on(addr.hostPing(r), (v) => {
        this.lastHostPing = Number(v)
        this.emit()
      })
      on(patterns.roundContent(r), (v, a) => {
        const i = parseRoundSubAddress(a, 'content')
        if (i == null) return
        this.runtimeContent.set(i, v)
        this.emit()
      })
      on(patterns.roundReveal(r), (v, a) => {
        const i = parseRoundSubAddress(a, 'reveal')
        if (i == null) return
        this.roundReveals.set(i, v)
        this.emit()
      })
    }

    if (this.me.role === 'player') {
      // A player only needs its own inputs back (reconnect restore + private score).
      on(patterns.inputsForPlayer(r, this.me.id), (v, a) => {
        const parsed = parseInputAddress(a)
        if (!parsed) return
        this.inputs.set(`${parsed.roundIndex}:${this.me.id}`, v)
        this.emit()
      })
    } else {
      // Host/viewer see the whole room.
      on(patterns.playerProfile(r), (v, a) => {
        const pid = pidFromPlayerAddress(a)
        if (!pid) return
        const prof = v as { name?: string; joinedAtIndex?: number }
        const prev = this.playersMap.get(pid)
        this.playersMap.set(pid, {
          id: pid,
          name: prof?.name ?? prev?.name ?? 'Player',
          joinedAtIndex: prof?.joinedAtIndex ?? prev?.joinedAtIndex ?? 0,
          lastPing: prev?.lastPing ?? null,
        })
        this.emit()
      })
      on(patterns.playerPing(r), (v, a) => {
        const pid = pidFromPlayerAddress(a)
        if (!pid) return
        const prev = this.playersMap.get(pid)
        this.playersMap.set(pid, {
          id: pid,
          name: prev?.name ?? 'Player',
          joinedAtIndex: prev?.joinedAtIndex ?? 0,
          lastPing: Number(v),
        })
        this.emit()
      })
      on(patterns.allInputs(r), (v, a) => {
        const parsed = parseInputAddress(a)
        if (!parsed) return
        this.inputs.set(`${parsed.roundIndex}:${parsed.pid}`, v)
        this.emit()
      })
    }
  }

  private publish(address: string, value: RelayValue): void {
    this.relay.set(address, value, { ttl: this.ttlUs, absolute: true })
  }

  // ---- reads ---------------------------------------------------------------

  getSnapshot(): RoomSnapshot {
    return {
      phase: this.state.phase,
      round: { ...this.state.round },
      players: this.recentPlayers(),
      me: this.me,
      config: this.config,
      meta: this.meta,
      results: this.results,
      connected: this.connected,
      reconnecting: this.reconnecting,
      error: this.error,
      ready: this.ready,
      joinedAtIndex: this.myJoinedAtIndex,
      hostPresent: this.hostIsPresent(),
    }
  }

  /**
   * Whether the host is currently live. The host is always "present" to itself.
   * Before any ping arrives we assume present, so the join screen doesn't flash
   * a false "host gone" (a truly dead room is caught by the join timeout). Once
   * a ping has been seen, presence is whether the latest one is within the
   * window, so a host that closed its tab is detected within a few seconds.
   */
  private hostIsPresent(): boolean {
    if (this.me.role === 'host') return true
    if (this.lastHostPing == null) return true
    return this.now() - this.lastHostPing < HOST_PRESENCE_WINDOW_MS
  }

  onChange(listener: Listener): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const l of this.listeners) l()
  }

  /**
   * Players considered present: a recent heartbeat, or any submitted input.
   * Keeping players who have answered (even if their heartbeat lapsed) is
   * intentional so scoring counts everyone who played.
   */
  recentPlayers(): Player[] {
    const now = this.now()
    const pidsWithInput = new Set<string>()
    for (const key of this.inputs.keys()) {
      pidsWithInput.add(key.slice(key.indexOf(':') + 1))
    }
    const out: Player[] = []
    for (const [pid, p] of this.playersMap) {
      const live = p.lastPing != null && now - p.lastPing < PRESENCE_WINDOW_MS
      if (live || pidsWithInput.has(pid)) out.push({ ...p })
    }
    return out
  }

  /** This player's own submission for a round (for restore). */
  inputFor(roundIndex: number): RelayValue | undefined {
    return this.inputs.get(`${roundIndex}:${this.me.id}`)
  }

  /** All submissions for a round, keyed by player id (host only). */
  inputsFor(roundIndex: number): Map<string, RelayValue> {
    const out = new Map<string, RelayValue>()
    for (const [key, value] of this.inputs) {
      const [idx, pid] = key.split(':')
      if (idx === String(roundIndex) && pid) out.set(pid, value)
    }
    return out
  }

  /** The runtime-derived content for a round, or undefined for a static round.
   *  The renderer overlays this on the authored content. */
  runtimeContentFor(roundIndex: number): RelayValue | undefined {
    return this.runtimeContent.get(roundIndex)
  }

  /** The public reveal summary for a round, once the host has revealed it. */
  roundRevealFor(roundIndex: number): RelayValue | undefined {
    return this.roundReveals.get(roundIndex)
  }

  /** The answer key for a round (host-side scoring): a runtime-derived key if one
   *  exists, else the authored static key. Undefined when the round has none. */
  answerKeyFor(roundIndex: number): RelayValue | undefined {
    if (this.derivedAnswers.has(roundIndex)) return this.derivedAnswers.get(roundIndex)
    return this.game?.answerKeys?.[roundIndex]
  }

  // ---- player actions ------------------------------------------------------

  /** Publish this player's input for the current round. */
  submit(input: RelayValue): void {
    if (this.me.role !== 'player') throw new Error('Only players submit inputs.')
    const i = this.state.round.index
    // A player can only act on rounds from when they joined, don't publish an
    // input for a round they joined after (every block's scoring assumes this).
    if (!isEligible(this.myJoinedAtIndex, i)) return
    this.inputs.set(`${i}:${this.me.id}`, input)
    this.publish(addr.input(this.room, i, this.me.id), input)
    this.emit()
  }

  private async ensureProfilePublished(): Promise<void> {
    if (this.me.role !== 'player' || this.profilePublished) return
    this.profilePublished = true // guard re-entry while the read is in flight
    // Read our profile (to detect a reconnect) and the round pointer together,
    // authoritatively. phase/index/state are published to separate addresses and
    // arrive in any order, so the local snapshot may hold only `phase` so far,
    // computing the join index from that partial view would mis-set eligibility
    // for a mid-game joiner. `allSettled` so one failed read can't sink the rest.
    const [profR, phaseR, indexR, stateR] = await Promise.allSettled([
      this.relay.get(addr.playerProfile(this.room, this.me.id)),
      this.relay.get(addr.phase(this.room)),
      this.relay.get(addr.roundIndex(this.room)),
      this.relay.get(addr.roundState(this.room)),
    ])
    const settled = (r: PromiseSettledResult<RelayValue>): RelayValue | undefined =>
      r.status === 'fulfilled' ? r.value : undefined
    const existing = settled(profR) as { joinedAtIndex?: number } | undefined
    let joinedAtIndex: number
    if (existing && typeof existing.joinedAtIndex === 'number') {
      joinedAtIndex = existing.joinedAtIndex // reconnect: keep original join point
    } else {
      const phaseV = settled(phaseR)
      const indexV = settled(indexR)
      const stateV = settled(stateR)
      const phase = (phaseV as Phase | undefined) ?? this.state.phase
      const round = {
        index: indexV != null ? Number(indexV) | 0 : this.state.round.index,
        state: (stateV as RoundState | undefined) ?? this.state.round.state,
        deadline: this.state.round.deadline,
      }
      joinedAtIndex = computeJoinedAtIndex(phase, round)
    }
    this.myJoinedAtIndex = joinedAtIndex
    this.publish(addr.playerProfile(this.room, this.me.id), {
      name: this.me.name,
      joinedAtIndex,
    })
    this.startHeartbeat()
    this.emit()
  }

  /** First round index this player may act on (0 until the profile is published). */
  get joinedAtIndex(): number {
    return this.myJoinedAtIndex
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer || this.me.role !== 'player') return
    const beat = () => this.publish(addr.playerPing(this.room, this.me.id), this.now())
    beat()
    this.heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
  }

  // ---- host actions --------------------------------------------------------

  /** Load the (already answer-stripped) game definition before starting. */
  loadGame(game: LoadedGame): void {
    this.assertHost()
    this.game = game
    // Hold the full config locally from load time (kept off the relay) so the
    // host UI can enable "Start" during the lobby. start() publishes the
    // redacted config; this local copy is also what scoring reads.
    this.config = game.config
    // If we're already connected, publish meta immediately so lobby joiners see
    // it; otherwise connect() will publish it once the socket is up.
    if (this.connected) this.publishMetaIfLoaded()
    this.emit()
  }

  start(): void {
    this.assertHost()
    if (!this.game) throw new Error('loadGame() must be called before start().')
    this.meta = this.game.meta
    // The host keeps the full config locally (for scoring); the relay gets the
    // redacted one so spectators cannot read answers early.
    this.config = this.game.config
    this.publish(addr.meta(this.room), this.game.meta as unknown as RelayValue)
    this.publish(addr.config(this.room), this.game.publishConfig ?? this.game.config)
    this.publish(addr.roundIndex(this.room), 0)
    this.publish(addr.roundState(this.room), 'ready')
    this.publish(addr.roundDeadline(this.room), null)
    this.publish(addr.phase(this.room), 'active')
    this.transition({ type: 'start' })
    this.publishDerivedIfAny(0)
  }

  /**
   * When the host lands on a round, give the game a chance to build that round's
   * content from earlier rounds' inputs (the two-phase pattern). The anonymized
   * content goes on the relay; the withheld answer key is kept for reveal/scoring.
   * A no-op for ordinary static rounds. Host only.
   */
  private publishDerivedIfAny(index: number): void {
    if (this.me.role !== 'host' || !this.game?.deriveContent) return
    const derived = this.game.deriveContent(index, (i) => this.inputsFor(i))
    if (!derived) return
    this.runtimeContent.set(index, derived.publish)
    this.publish(addr.roundContent(this.room, index), derived.publish)
    if (derived.answer !== undefined) this.derivedAnswers.set(index, derived.answer)
    this.emit()
  }

  openVoting(): void {
    this.assertHost()
    const timer = this.game?.rounds[this.state.round.index]?.timer ?? null
    // `timer != null` (not truthiness) so a 0-second timer auto-locks immediately
    // instead of being mistaken for "no timer".
    const deadline = timer != null ? this.now() + timer * 1000 : null
    this.publish(addr.roundDeadline(this.room), deadline)
    this.publish(addr.roundState(this.room), 'open')
    this.transition({ type: 'open', deadline })
  }

  lock(): void {
    this.assertHost()
    this.publish(addr.roundDeadline(this.room), null)
    this.publish(addr.roundState(this.room), 'locked')
    this.transition({ type: 'lock' })
  }

  reveal(): void {
    this.assertHost()
    const i = this.state.round.index
    const answer = this.answerKeyFor(i)
    if (answer !== undefined) this.publish(addr.roundAnswer(this.room, i), answer)
    // Publish a public reveal summary (vote tallies, the winner) so phones can
    // show personal feedback, not just the big screen.
    const summary = this.game?.revealSummary?.(i, (j) => this.inputsFor(j))
    if (summary !== undefined) {
      this.roundReveals.set(i, summary)
      this.publish(addr.roundReveal(this.room, i), summary)
    }
    this.publish(addr.roundState(this.room), 'reveal')
    this.transition({ type: 'reveal' })
  }

  next(): void {
    this.assertHost()
    const roundCount = this.game?.rounds.length ?? 0
    this.transition({ type: 'next', roundCount })
    const i = this.state.round.index
    // Build this round's content from earlier rounds before announcing it, so a
    // player sees the derived content as soon as the round becomes current.
    this.publishDerivedIfAny(i)
    this.publish(addr.roundIndex(this.room), i)
    this.publish(addr.roundState(this.room), 'ready')
    this.publish(addr.roundDeadline(this.room), null)
  }

  /** End the game and publish the results summary the plugin computed. */
  finish(summary: RelayValue): void {
    this.assertHost()
    this.results = summary
    this.publish(addr.resultsSummary(this.room), summary)
    this.publish(addr.phase(this.room), 'results')
    this.transition({ type: 'finish' })
  }

  /** Whether `actionType` is currently legal (drives which control the host shows). */
  can(actionType: HostAction['type']): boolean {
    const roundCount = this.game?.rounds.length ?? 0
    const action = { type: actionType, roundCount } as HostAction
    return canTransition(this.state, action)
  }

  /** Drive the countdown and auto-lock when a timed round's deadline passes. */
  tick(now: number = this.now()): void {
    if (this.me.role !== 'host') return
    if (shouldAutoLock(this.state, now)) this.lock()
  }

  /** Apply a host action to local state and notify listeners. */
  private transition(action: HostAction): void {
    this.state = reduce(this.state, action)
    this.emit()
  }

  private assertHost(): void {
    if (this.me.role !== 'host') throw new Error('Only the host may drive the room.')
  }
}

/** Convenience factory. */
export function createRoom(opts: RoomRuntimeOptions): RoomRuntime {
  return new RoomRuntime(opts)
}
