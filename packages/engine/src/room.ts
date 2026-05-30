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
import { addr, parseInputAddress, patterns, pidFromPlayerAddress } from './addresses'
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
  private config: RelayValue | undefined
  private meta: RoomMeta | undefined
  private results: RelayValue | undefined

  private connected = false
  private reconnecting = false
  private error: string | null = null
  private ready = false
  private profilePublished = false
  private myJoinedAtIndex = 0

  private game: LoadedGame | null = null
  private unsubs: Unsubscribe[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
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
    }
    this.emit()
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
    }
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
    // A player does not subscribe to its own profile, so `cached()` is empty;
    // round-trip with `get()` to detect a reconnect and keep the original join
    // index. Falling back to the current state is correct for a first join.
    let existing: { joinedAtIndex?: number } | undefined
    try {
      existing = (await this.relay.get(addr.playerProfile(this.room, this.me.id))) as
        | { joinedAtIndex?: number }
        | undefined
    } catch {
      existing = undefined
    }
    const joinedAtIndex =
      existing && typeof existing.joinedAtIndex === 'number'
        ? existing.joinedAtIndex // reconnect: keep original join point
        : computeJoinedAtIndex(this.state.phase, this.state.round)
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
    const answer = this.game?.answerKeys?.[i]
    if (answer !== undefined) this.publish(addr.roundAnswer(this.room, i), answer)
    this.publish(addr.roundState(this.room), 'reveal')
    this.transition({ type: 'reveal' })
  }

  next(): void {
    this.assertHost()
    const roundCount = this.game?.rounds.length ?? 0
    this.transition({ type: 'next', roundCount })
    this.publish(addr.roundIndex(this.room), this.state.round.index)
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
