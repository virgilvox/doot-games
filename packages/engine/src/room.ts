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
  parseAudienceVoteAddress,
  parseInputAddress,
  parseRoundContentForPlayer,
  parseRoundSubAddress,
  patterns,
  pidFromPlayerAddress,
  roomBase,
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
// A relay.get on a key that doesn't exist doesn't answer "absent" quickly, it
// hangs until the relay's own multi-second get timeout. The pre-join name probe
// reads keys that are usually ABSENT (a fresh, un-taken name), so it races each
// read against this short timeout to stay snappy. A present key returns its
// snapshot well within this.
const PROBE_GET_TIMEOUT_MS = 700
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
  /**
   * Hidden-role / per-player pattern: build SECRET per-player content for round
   * `index` from the current roster AND earlier rounds' inputs. Host-only, called
   * when the host lands on the round. Like `deriveContent` it receives `inputsFor`,
   * so a per-player chain (Gartic Phone) can hand each player another player's
   * round N-1 output; the hidden-role case (faker) ignores it and reads only the
   * roster. Returns a `perPlayer` map (pid -> that player's content, published to
   * their own private address) plus an optional withheld `answer` (e.g. which
   * player is the imposter), revealed at reveal like any other answer key.
   * Undefined for an ordinary round.
   */
  assignContent?: (
    index: number,
    inputsFor: (i: number) => Map<string, RelayValue>,
  ) => { perPlayer: Record<string, RelayValue>; answer?: RelayValue } | undefined
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

/**
 * A drive intent the delegated player (co-host/MC) can send. The host maps each
 * to the matching host action; `start` begins the game from the lobby and
 * `startVote` is the make-round shortcut (reveal + next). The engine only
 * validates and forwards; the host UI interprets them.
 */
export type ControlAction = 'start' | 'open' | 'lock' | 'reveal' | 'startVote' | 'next' | 'finish'

/** A read-only snapshot of live room state. */
export interface RoomSnapshot {
  phase: Phase
  round: RoomState['round']
  players: Player[]
  me: Identity
  config: RelayValue | undefined
  meta: RoomMeta | undefined
  results: RelayValue | undefined
  /** Running standings between rounds (cumulative through the revealed rounds). */
  standings: RelayValue | undefined
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
  /** Host only: how many spectators are watching (0 for other roles). */
  audienceCount: number
  /** The delegated driver's pid (co-host/MC), or null if the host drives. */
  driverPid: string | null
  /** True when this client is the delegated driver (a player who may advance). */
  isDriver: boolean
  /** Host only: the latest validated drive intent to apply, or null. The host UI
   *  watches its `nonce` and dispatches it through the same handlers its buttons use. */
  command: { action: ControlAction; nonce: number } | null
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
  /** Host-only: audience id -> last heartbeat, for the "N watching" count. */
  private audiencePings = new Map<string, number>()
  /** Audience votes (P4B). Host collects every spectator's; an audience member
   *  keeps its own. Key `${round}:${id}`. Kept apart from `inputs` so spectator
   *  votes never enter scoring. */
  private audienceVotes = new Map<string, RelayValue>()
  private inputs = new Map<string, RelayValue>() // key `${round}:${pid}`
  /** Runtime-derived content per round (two-phase). Host fills it on publish;
   *  player/viewer fill it from the relay. Overrides authored content. */
  private runtimeContent = new Map<number, RelayValue>()
  /** This player's own SECRET per-round content (hidden-role games). Filled from
   *  the player's private per-round address; overrides everything for the player. */
  private perPlayerContent = new Map<number, RelayValue>()
  /** Public per-round reveal summaries, keyed by round index. */
  private roundReveals = new Map<number, RelayValue>()
  /** Host-only: the withheld answer key a runtime derivation produced (e.g. the
   *  author map for a vote round), so end-of-game scoring can read it. */
  private derivedAnswers = new Map<number, RelayValue>()
  /** Host-only: rounds whose answer came from a hidden-role `assignContent` (e.g.
   *  who the faker is). Such an answer is kept host-side for the consuming judge
   *  round + scoring, but is NEVER auto-published at this round's own reveal: the
   *  whole point of a hidden role is that it stays secret until the judge round
   *  chooses to unmask it (by republishing it as its own answer). Without this, the
   *  make round's reveal would leak the imposter before the accusation. */
  private assignedRounds = new Set<number>()
  private config: RelayValue | undefined
  private meta: RoomMeta | undefined
  private results: RelayValue | undefined
  /** Running standings (cumulative through the revealed rounds). Host computes +
   *  publishes; player/viewer read from the relay. */
  private standings: RelayValue | undefined

  private connected = false
  private reconnecting = false
  private error: string | null = null
  private ready = false
  private profilePublished = false
  private myJoinedAtIndex = 0
  /** Last host-ping timestamp seen (player/viewer only). */
  private lastHostPing: number | null = null
  /** The delegated driver's pid (everyone tracks it), or null for host-driven. */
  private driverPid: string | null = null
  /** Host: the latest validated drive intent for the host UI to apply. */
  private incomingCommand: { action: ControlAction; nonce: number } | null = null
  /** Host: the last drive-command nonce handled, to drop relay re-deliveries. */
  private lastCommandNonce: number | null = null
  /** Player: a monotonic nonce stamped on each drive intent we send. */
  private controlNonce = 0

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
      // A player id is derived from room+name (reconnect-by-name). An audience member
      // needs a UNIQUE id per tab so the host can count distinct spectators, but it is
      // never scored, so it does not need to be reconnect-stable. Host/viewer are
      // singletons under a role-scoped id.
      id:
        opts.role === 'player'
          ? playerId(opts.room, name)
          : opts.role === 'audience'
            ? `aud_${opts.room}_${Math.random().toString(36).slice(2, 10)}`
            : `${opts.role}_${opts.room}`,
    }
  }

  /**
   * Probe whether a name is already actively in use in a room, before a player
   * commits to joining under it. Identity is `hash(room + name)`, so two people
   * typing the same name collide onto one identity (and one reclaims the other's
   * inputs and score). This reads the target id's last heartbeat and profile and
   * reports whether a phone is currently live on that name (a ping within the
   * presence window). The join UI uses it to warn on a live collision while still
   * allowing a genuine reconnect (a stale or absent ping reads as not present).
   *
   * Fail-open by design: the caller should bound this with a timeout and treat
   * any error as "not present", a relay hiccup must never stop someone joining.
   */
  static async probePresence(
    relay: RelayClient,
    room: string,
    name: string,
    now: () => number = Date.now,
    timeoutMs: number = PROBE_GET_TIMEOUT_MS,
  ): Promise<{ id: string; present: boolean; hasProfile: boolean }> {
    const id = playerId(room, name)
    // Race each read against a short timeout that resolves to undefined, so an
    // absent key (the common case: a name nobody is using) reports "not present"
    // promptly instead of leaving a new player on a "checking" spinner until the
    // relay's own get timeout fires.
    const read = (address: string): Promise<RelayValue | undefined> =>
      Promise.race([
        relay.get(address).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ])
    const [ping, prof] = await Promise.all([
      read(addr.playerPing(room, id)),
      read(addr.playerProfile(room, id)),
    ])
    const hasProfile = prof != null
    const present = ping != null && now() - Number(ping) < PRESENCE_WINDOW_MS
    return { id, present, hasProfile }
  }

  /**
   * Count players currently live in a room (a heartbeat within the presence
   * window), for a soft pre-join capacity check. Subscribes briefly to the ping
   * addresses, collects the retained snapshots the relay delivers on subscribe,
   * then resolves the count. Fail-open: resolves 0 on any error, so a flaky relay
   * never wrongly turns a player away.
   */
  static probeLiveCount(
    relay: RelayClient,
    room: string,
    now: () => number = Date.now,
    windowMs = 600,
  ): Promise<number> {
    return new Promise((resolve) => {
      const pings = new Map<string, number>()
      let unsub: Unsubscribe | null = null
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        try {
          unsub?.()
        } catch {
          /* ignore */
        }
        const t = now()
        let n = 0
        for (const ms of pings.values()) if (t - ms < PRESENCE_WINDOW_MS) n++
        resolve(n)
      }
      try {
        unsub = relay.on(patterns.playerPing(room), (v, a) => {
          const pid = pidFromPlayerAddress(a)
          if (pid) pings.set(pid, Number(v))
        })
      } catch {
        resolve(0)
        return
      }
      setTimeout(finish, windowMs)
    })
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
    // An audience member broadcasts its own liveness so the host can count watchers.
    if (this.me.role === 'audience') this.startAudienceHeartbeat()
    this.emit()
  }

  private startAudienceHeartbeat(): void {
    if (this.heartbeatTimer || this.me.role !== 'audience') return
    const beat = () => this.publish(addr.audiencePing(this.room, this.me.id), this.now())
    beat()
    this.heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL_MS)
  }

  /** Host-only: how many spectators are currently watching (a recent audience ping). */
  private audienceCount(): number {
    if (this.me.role !== 'host') return 0
    const now = this.now()
    let n = 0
    for (const ts of this.audiencePings.values()) if (now - ts < PRESENCE_WINDOW_MS) n++
    return n
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
      on(addr.standings(r), (v) => {
        this.standings = v
        this.emit()
      })
      on(addr.hostPing(r), (v) => {
        this.lastHostPing = Number(v)
        this.emit()
      })
      // Who (if anyone) the host has delegated driving to. Players read this to
      // know whether to show the advance controls; viewers just track it.
      on(addr.controlDriver(r), (v) => {
        const pid = typeof v === 'string' ? v : ''
        this.driverPid = pid.length ? pid : null
        this.emit()
      })
      on(patterns.roundContent(r), (v, a) => {
        const i = parseRoundSubAddress(a, 'content')
        if (i == null) return
        // null clears it (a session's nextGame wipes the previous game's rounds).
        if (v == null) this.runtimeContent.delete(i)
        else this.runtimeContent.set(i, v)
        this.emit()
      })
      on(patterns.roundReveal(r), (v, a) => {
        const i = parseRoundSubAddress(a, 'reveal')
        if (i == null) return
        if (v == null) this.roundReveals.delete(i)
        else this.roundReveals.set(i, v)
        this.emit()
      })
    }

    // Roster: host/player/viewer track who is in the room (public names + presence).
    // This is deliberately NOT player inputs, those stay host/viewer-only below, so a
    // player can never read another player's answers (the withholding invariant).
    // Players need the roster for roster games like Most Likely To (you vote for
    // another player) and Truth or Share (the picker chooses a target). An AUDIENCE
    // member skips the roster (and every input below): a spectator reads only the
    // display state, which keeps their bandwidth low and never deanonymizes inputs.
    if (this.me.role !== 'audience') {
    on(patterns.playerProfile(r), (v, a) => {
      const pid = pidFromPlayerAddress(a)
      if (!pid) return
      const prof = v as { name?: string; joinedAtIndex?: number }
      const prev = this.playersMap.get(pid)
      this.playersMap.set(pid, {
        id: pid,
        name: prof?.name ?? prev?.name ?? 'Player',
        joinedAtIndex: prof?.joinedAtIndex ?? prev?.joinedAtIndex ?? 0,
        // A profile is only published by an actively-joining client, so treat its
        // first arrival as a presence pulse (show them immediately, without waiting
        // for the heartbeat). `?? this.now()` only fires on first sight.
        lastPing: prev?.lastPing ?? this.now(),
        team: prev?.team, // preserve a team that arrived before the profile
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
        team: prev?.team,
      })
      this.emit()
    })
    // Teams (when on): every role tracks each player's team so the host roster and
    // the team board can group/colour by it. A player writes their own; the host
    // may write any player's (assign / auto-balance). '' clears it.
    on(patterns.playerTeam(r), (v, a) => {
      const pid = pidFromPlayerAddress(a)
      if (!pid) return
      const team = typeof v === 'string' && v.length ? v : undefined
      const prev = this.playersMap.get(pid)
      this.playersMap.set(pid, {
        id: pid,
        name: prev?.name ?? 'Player',
        joinedAtIndex: prev?.joinedAtIndex ?? 0,
        lastPing: prev?.lastPing ?? null,
        team,
      })
      this.emit()
    })
    } // end roster (skipped for audience)

    if (this.me.role === 'player') {
      // A player only needs its own inputs back (reconnect restore + private score).
      on(patterns.inputsForPlayer(r, this.me.id), (v, a) => {
        const parsed = parseInputAddress(a)
        if (!parsed) return
        const key = `${parsed.roundIndex}:${this.me.id}`
        // null clears it: a session's nextGame wipes the previous game's inputs, and
        // a cleared input must read as "not submitted" (not as an empty submission).
        if (v == null) this.inputs.delete(key)
        else this.inputs.set(key, v)
        this.emit()
      })
      // This player's own SECRET per-round content (hidden-role games), delivered
      // only to their private address so another player's UI never shows it.
      on(patterns.myRoundContent(r, this.me.id), (v, a) => {
        const parsed = parseRoundContentForPlayer(a)
        if (!parsed) return
        if (v == null) this.perPlayerContent.delete(parsed.roundIndex)
        else this.perPlayerContent.set(parsed.roundIndex, v)
        this.emit()
      })
    } else if (this.me.role === 'host' || this.me.role === 'viewer') {
      // Host/viewer also receive every player's inputs (for tallying + the big
      // screen). A player never subscribes here, so it can't read others' answers,
      // and an AUDIENCE member never subscribes here either (spectators must not be
      // able to read raw inputs, which would deanonymize a two-phase gallery).
      on(patterns.allInputs(r), (v, a) => {
        const parsed = parseInputAddress(a)
        if (!parsed) return
        const key = `${parsed.roundIndex}:${parsed.pid}`
        if (v == null) this.inputs.delete(key)
        else this.inputs.set(key, v)
        this.emit()
      })
      // Host/viewer also collect audience votes (P4B), kept separate from inputs so
      // they never reach scoring; only display blocks (the poll) read them.
      on(patterns.audienceVotes(r), (v, a) => {
        const parsed = parseAudienceVoteAddress(a)
        if (!parsed) return
        const key = `${parsed.roundIndex}:${parsed.id}`
        if (v == null) this.audienceVotes.delete(key)
        else this.audienceVotes.set(key, v)
        this.emit()
      })
      // Host only: drive intents from the delegated player. Apply one only if it
      // comes from the CURRENT driver and targets the CURRENT round (so a stale
      // tap after the round advanced can't double-fire), and drop relay
      // re-deliveries by nonce. The host UI watches `command` and dispatches it.
      if (this.me.role === 'host') {
        on(addr.controlCommand(r), (v) => {
          const cmd = v as { pid?: string; action?: ControlAction; index?: number; nonce?: number } | null
          // Require a nonce: a command without one can't be deduped, so a relay
          // re-delivery would re-fire it. `sendControl` always supplies one.
          if (!cmd || cmd.action == null || cmd.nonce == null) return
          if (cmd.pid !== this.driverPid) return // only the current delegate may drive
          if (cmd.index !== this.state.round.index) return // stale: the round already moved on
          if (cmd.nonce === this.lastCommandNonce) return // drop a relay re-delivery
          this.lastCommandNonce = cmd.nonce
          this.incomingCommand = { action: cmd.action, nonce: cmd.nonce }
          this.emit()
        })
        // Track audience heartbeats so the host can show "N watching". A spectator's
        // id is unique per tab, so distinct live pings = the audience size.
        on(patterns.audiencePing(r), (v, a) => {
          const id = a.split('/')[4]
          if (id) this.audiencePings.set(id, Number(v))
          this.emit()
        })
      }
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
      standings: this.standings,
      connected: this.connected,
      reconnecting: this.reconnecting,
      error: this.error,
      ready: this.ready,
      joinedAtIndex: this.myJoinedAtIndex,
      hostPresent: this.hostIsPresent(),
      audienceCount: this.audienceCount(),
      driverPid: this.driverPid,
      isDriver: this.me.role === 'player' && this.driverPid != null && this.driverPid === this.me.id,
      command: this.me.role === 'host' ? this.incomingCommand : null,
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

  /** This player's own SECRET content for a round (hidden-role games), or
   *  undefined. Takes precedence over the shared/authored content for the player. */
  perPlayerContentFor(roundIndex: number): RelayValue | undefined {
    return this.perPlayerContent.get(roundIndex)
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

  /** Publish this audience member's vote for the current round (P4B). Audience-only;
   *  goes to a separate namespace so it never enters scoring or deanonymizes players. */
  submitAudience(vote: RelayValue): void {
    if (this.me.role !== 'audience') throw new Error('Only the audience submits votes.')
    const i = this.state.round.index
    this.audienceVotes.set(`${i}:${this.me.id}`, vote)
    this.publish(addr.audienceVote(this.room, i, this.me.id), vote)
    this.emit()
  }

  /** Audience votes for a round, id -> vote (host reads these for the crowd bloc). */
  audienceVotesFor(roundIndex: number): Map<string, RelayValue> {
    const out = new Map<string, RelayValue>()
    for (const [key, value] of this.audienceVotes) {
      const [idx, id] = key.split(':')
      if (idx === String(roundIndex) && id) out.set(id, value)
    }
    return out
  }

  /** Send a drive intent as the delegated player (co-host/MC). A no-op unless the
   *  host has delegated driving to this player. The host validates and applies it. */
  sendControl(action: ControlAction): void {
    if (this.me.role !== 'player' || this.driverPid !== this.me.id) return
    // Time-seeded, strictly-increasing nonce. A plain counter restarts at 0 when
    // this runtime is recreated (a reconnect), which could collide with a nonce
    // the host already saw and get a real tap silently deduped. Seeding from the
    // clock makes a post-reconnect nonce larger than anything the host has seen.
    const nonce = Math.max(this.now(), this.controlNonce + 1)
    this.controlNonce = nonce
    this.publish(addr.controlCommand(this.room), {
      pid: this.me.id,
      action,
      index: this.state.round.index,
      nonce,
    })
  }

  /** Set (or clear with null) this player's team. A no-op unless we are a player.
   *  Published to the player's own team address (ephemeral, retained), so a
   *  reconnecting player keeps it. Updates local state at once for a snappy UI. */
  setTeam(team: string | null): void {
    if (this.me.role !== 'player') return
    const value = team && team.length ? team : ''
    const prev = this.playersMap.get(this.me.id)
    this.playersMap.set(this.me.id, {
      id: this.me.id,
      name: prev?.name ?? this.me.name,
      joinedAtIndex: prev?.joinedAtIndex ?? this.myJoinedAtIndex,
      lastPing: prev?.lastPing ?? this.now(),
      team: value || undefined,
    })
    this.publish(addr.playerTeam(this.room, this.me.id), value)
    this.emit()
  }

  /** This player's own team, or null (for the lobby picker's selected state). */
  get myTeam(): string | null {
    return this.playersMap.get(this.me.id)?.team ?? null
  }

  // ---- custom channels (for custom-flow games) -----------------------------

  /**
   * Publish to a game-defined custom channel under `/<room>/x/<key>`. Lets a
   * custom-flow game (the Circuit Cypher battle, live cheers, ...) drive its own
   * state over the relay without bypassing the engine, TTL-scoped like everything
   * else. Any role may publish.
   */
  publishExtra(key: string, value: RelayValue): void {
    this.publish(addr.extra(this.room, key), value)
  }

  /**
   * Subscribe to a custom channel; `keyPattern` may be multi-segment and contain
   * `*`. The callback gets the value and the key suffix (the part after `/x/`).
   * Tracked for teardown on dispose; the returned unsubscribe also removes it.
   *
   * Connection-safe: the relay drops a subscription made before the socket has
   * connected (it is not replayed), and a custom-flow host registers its channels
   * from a component `onMounted` that runs before the async `connect()` resolves.
   * So if we aren't connected yet, defer the actual `relay.on` to the next connect
   * (idempotently), instead of subscribing into the void.
   */
  onExtra(keyPattern: string, cb: (value: RelayValue, key: string) => void): Unsubscribe {
    const prefix = `${roomBase(this.room)}/x/`
    let unsub: Unsubscribe | null = null
    let cancelled = false
    const subscribe = () => {
      if (cancelled || unsub) return
      unsub = this.relay.on(addr.extra(this.room, keyPattern), (v, a) => {
        cb(v, a.startsWith(prefix) ? a.slice(prefix.length) : a)
      })
    }
    if (this.relay.connected) subscribe()
    else this.relay.onConnect(subscribe) // fires on the first (and every re)connect
    const teardown: Unsubscribe = () => {
      cancelled = true
      try {
        unsub?.()
      } catch {
        /* ignore */
      }
      unsub = null
    }
    this.unsubs.push(teardown)
    return () => {
      const i = this.unsubs.indexOf(teardown)
      if (i >= 0) this.unsubs.splice(i, 1)
      teardown()
    }
  }

  private async ensureProfilePublished(): Promise<void> {
    if (this.me.role !== 'player' || this.profilePublished) return
    this.profilePublished = true // guard re-entry while the read is in flight

    // Common party case: everyone joins during the lobby. No round has started,
    // so this player's join index is unconditionally 0 (a lobby reconnect is 0
    // too, since the phase only moves forward, never back to lobby). Publish the
    // profile and start heartbeating immediately, without waiting on the
    // authoritative reads, so the host roster shows the player the instant they
    // join instead of after a relay round-trip.
    if (this.state.phase === 'lobby') {
      this.myJoinedAtIndex = 0
      this.publishProfile(0)
      this.startHeartbeat()
      this.emit()
      return
    }

    // Mid-game (or post-game) join: the join index depends on the live round
    // state and on whether this is a reconnect, so read our profile (to detect a
    // reconnect) and the round pointer together, authoritatively. phase/index/
    // state are published to separate addresses and arrive in any order, so the
    // local snapshot may hold only `phase` so far; computing the join index from
    // that partial view would mis-set eligibility for a mid-game joiner.
    // `allSettled` so one failed read can't sink the rest.
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
    this.publishProfile(joinedAtIndex)
    this.startHeartbeat()
    this.emit()
  }

  private publishProfile(joinedAtIndex: number): void {
    this.publish(addr.playerProfile(this.room, this.me.id), {
      name: this.me.name,
      joinedAtIndex,
    })
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

  /** Set or clear the soft player cap and republish meta so the join screen,
   *  which reads `meta.playerCap`, can turn away players past it. Lobby control. */
  setPlayerCap(cap: number | null): void {
    this.assertHost()
    const base = this.meta ?? this.game?.meta
    if (!base) return
    this.meta = { ...base, playerCap: cap && cap > 0 ? cap : undefined }
    if (this.game) this.game = { ...this.game, meta: this.meta }
    this.publish(addr.meta(this.room), this.meta as unknown as RelayValue)
    this.emit()
  }

  /** Delegate driving to a player (co-host/MC), or pass null to drive yourself.
   *  Publishes the driver so that player's phone shows the advance controls. */
  setDriver(pid: string | null): void {
    this.assertHost()
    this.driverPid = pid && pid.length ? pid : null
    this.publish(addr.controlDriver(this.room), this.driverPid ?? '')
    // Wipe any retained drive command and reset the dedup state. Every published
    // value is retained on the relay with a long TTL, so without this the LAST
    // command would linger and could re-fire (e.g. a phantom `reveal` leaking the
    // answer key) after a host reload or a re-delegation lands the room back on
    // that command's round index. A null command is ignored by the handler.
    this.publish(addr.controlCommand(this.room), null)
    this.lastCommandNonce = null
    this.incomingCommand = null
    this.emit()
  }

  /** Turn teams on with these names (or off with [] / null). Republishes meta so
   *  players see the team picker. Ephemeral lobby control, mirrors setPlayerCap. */
  setTeams(names: string[] | null): void {
    this.assertHost()
    const base = this.meta ?? this.game?.meta
    if (!base) return
    const teams = names && names.length ? names : undefined
    this.meta = { ...base, teams }
    if (this.game) this.game = { ...this.game, meta: this.meta }
    this.publish(addr.meta(this.room), this.meta as unknown as RelayValue)
    this.emit()
  }

  /** Host: assign (or clear with null) a player's team, e.g. an auto-balance.
   *  Publishes to that player's team address, exactly as the player would; the
   *  host's own team subscription folds it back into the roster. */
  assignTeam(pid: string, team: string | null): void {
    this.assertHost()
    this.publish(addr.playerTeam(this.room, pid), team && team.length ? team : '')
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
    this.publishAssignedIfAny(0)
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

  /**
   * When the host lands on a round, give the game a chance to assign SECRET
   * per-player content (hidden-role pattern): each player's payload goes to their
   * own private address, and an optional withheld answer (e.g. who the imposter
   * is) is kept for reveal/scoring. A no-op for ordinary rounds. Host only.
   */
  private publishAssignedIfAny(index: number): void {
    if (this.me.role !== 'host' || !this.game?.assignContent) return
    // Like `deriveContent`, hand the assigner earlier rounds' inputs so per-player
    // content can be derived from a prior round (a chain), not just the roster. At
    // round i the prior round's inputs are already in `this.inputs` (we advanced
    // past its reveal), so `inputsFor(i-1)` is complete.
    const assigned = this.game.assignContent(index, (i) => this.inputsFor(i))
    if (!assigned) return
    for (const [pid, content] of Object.entries(assigned.perPlayer)) {
      this.publish(addr.roundContentForPlayer(this.room, index, pid), content)
    }
    if (assigned.answer !== undefined) {
      this.derivedAnswers.set(index, assigned.answer)
      // Mark this as an assigned (hidden-role) answer so reveal() keeps it host-side.
      this.assignedRounds.add(index)
    }
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
    // A hidden-role assignment answer (who the imposter is) stays host-side: the
    // judge round that consumes it unmasks it at its own reveal. Publishing it here
    // would leak the role before the accusation. A normal answer key still publishes.
    const answer = this.assignedRounds.has(i) ? undefined : this.answerKeyFor(i)
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
    // player sees the derived (or secret per-player) content as soon as the round
    // becomes current.
    this.publishDerivedIfAny(i)
    this.publishAssignedIfAny(i)
    this.publish(addr.roundIndex(this.room), i)
    this.publish(addr.roundState(this.room), 'ready')
    this.publish(addr.roundDeadline(this.room), null)
  }

  /** Publish the running standings (cumulative scores through the revealed rounds)
   *  so phones + the big screen can show a between-round leaderboard. Host only;
   *  purely presentational and ephemeral, never the database. */
  publishStandings(summary: RelayValue): void {
    this.assertHost()
    this.standings = summary
    this.publish(addr.standings(this.room), summary)
    this.emit()
  }

  /** End the game and publish the results summary the plugin computed. */
  finish(summary: RelayValue): void {
    this.assertHost()
    this.results = summary
    this.publish(addr.resultsSummary(this.room), summary)
    this.publish(addr.phase(this.room), 'results')
    this.transition({ type: 'finish' })
  }

  /**
   * Sessions: swap in the next game in the SAME room without players rejoining.
   * Wipes the previous game's per-round relay state (so reused round indices can't
   * inherit stale inputs / derived content / answers / reveals — publishing null
   * clears each, and the subscription handlers treat null as absent), then loads the
   * new game and re-enters the active phase at round 0. Presence persists: players,
   * audience, teams, and the delegated driver all carry across. Host only.
   */
  nextGame(game: LoadedGame): void {
    this.assertHost()
    const prevRounds = this.game?.rounds.length ?? 0
    const pids = this.recentPlayers().map((p) => p.id)
    for (let i = 0; i < prevRounds; i++) {
      this.publish(addr.roundContent(this.room, i), null)
      this.publish(addr.roundReveal(this.room, i), null)
      this.publish(addr.roundAnswer(this.room, i), null)
      for (const pid of pids) {
        this.publish(addr.input(this.room, i, pid), null)
        this.publish(addr.roundContentForPlayer(this.room, i, pid), null)
      }
    }
    this.publish(addr.standings(this.room), null)
    this.publish(addr.resultsSummary(this.room), null)
    this.publish(addr.controlCommand(this.room), null)
    this.lastCommandNonce = null
    this.incomingCommand = null
    // Clear local ephemeral state for the previous game.
    this.inputs.clear()
    this.audienceVotes.clear()
    this.runtimeContent.clear()
    this.perPlayerContent.clear()
    this.roundReveals.clear()
    this.derivedAnswers.clear()
    this.assignedRounds.clear()
    this.results = undefined
    this.standings = undefined
    // Load + start the next game (re-enter active at round 0, regardless of phase).
    this.game = game
    this.config = game.config
    this.meta = game.meta
    this.state = { phase: 'active', round: { index: 0, state: 'ready', deadline: null } }
    this.publish(addr.meta(this.room), game.meta as unknown as RelayValue)
    this.publish(addr.config(this.room), game.publishConfig ?? game.config)
    this.publish(addr.roundIndex(this.room), 0)
    this.publish(addr.roundState(this.room), 'ready')
    this.publish(addr.roundDeadline(this.room), null)
    this.publish(addr.phase(this.room), 'active')
    this.publishDerivedIfAny(0)
    this.publishAssignedIfAny(0)
    this.emit()
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
