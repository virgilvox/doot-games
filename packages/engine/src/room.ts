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
import { makeRoomCode, playerId } from './identity'
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
// How coarsely the memoized roster re-evaluates the clock. Presence is measured in
// tens of seconds, so a second's granularity is invisible and keeps the host's
// four-times-a-second tick from rebuilding the roster every time.
const PRESENCE_TICK_BUCKET_MS = 1_000
// Presence is TIME-based: a phone that closes its tab sends nothing, it just stops
// beating. Some local clock therefore has to notice. Players and viewers get that from
// the composable's own refresh interval; the host has only its countdown tick, which
// does not touch the snapshot, so the host sweeps for it on this cadence and emits
// only when the present set actually changed.
const PRESENCE_SWEEP_MS = 2_000
// Presence is a room-wide broadcast: every non-audience client subscribes to
// `player/*/ping`, so N players beating every 5s costs the relay N deliveries to each
// of N clients per beat. That is nothing for a house party and is the single dominant
// cost of a 200-phone room, so past this many players the beat slows down in
// proportion (and the staleness window widens to match, so a phone still gets four
// missed beats of grace before it reads as gone). A normal room never leaves the 5s
// default: the first step is only crossed above ROSTER_STEP players.
const ROSTER_STEP = 60
// The cap is deliberately well UNDER `PRESENCE_WINDOW_MS`, because the pre-join name
// probe (`probePresence`) reads a single retained ping and asks "is it fresher than the
// base window". If the beat ever reached the window, a live player's last beat would be
// up to a full window old and would read as ABSENT roughly half the time: the
// duplicate-name warning would stop firing exactly in the big rooms this pacing exists
// for, and two phones would silently share one identity. Keep beat << window.
const MAX_HEARTBEAT_INTERVAL_MS = 10_000
/** The beat a room of `n` players uses (5s until it is genuinely big). */
export function heartbeatIntervalFor(n: number): number {
  const steps = Math.max(1, Math.ceil(n / ROSTER_STEP))
  return Math.min(HEARTBEAT_INTERVAL_MS * steps, MAX_HEARTBEAT_INTERVAL_MS)
}
/**
 * How long a player stays "present" after their last beat, at that beat's cadence.
 *
 * Three missed beats of grace, not four: this window is also how long the room waits
 * on someone who has WALKED OUT before "everyone has answered" can fire and before
 * they leave the roster, so every second of slack here is a second of dead air in a
 * big room. Three beats still covers a dropped frame or a brief reconnect, and with
 * the beat capped at 10s the widest this ever gets is 30s against the old fixed 20s.
 */
export function presenceWindowFor(intervalMs: number): number {
  return Math.max(PRESENCE_WINDOW_MS, intervalMs * 3)
}
// A relay.get on a key that doesn't exist doesn't answer "absent" quickly, it
// hangs until the relay's own multi-second get timeout. The pre-join name probe
// reads keys that are usually ABSENT (a fresh, un-taken name), so it races each
// read against this short timeout to stay snappy. A present key returns its
// snapshot well within this.
const PROBE_GET_TIMEOUT_MS = 700
// The host republishes a liveness ping on this cadence; players treat the host
// as gone once its last ping is older than the window (a few missed beats).
export const HOST_HEARTBEAT_INTERVAL_MS = 5_000
/**
 * How stale the host's liveness may get before the room says it went away.
 *
 * Three missed beats (16s) was too tight for a real venue: a host tab that is
 * not the frontmost tab gets its `setInterval` clamped by the browser, and the
 * room would flip to "the host's screen went away" for most of every minute.
 * Since presence is now measured on the receiver's own clock, this window is
 * pure throttling margin, so it buys the room a full minute of browser
 * misbehaviour before it says anything. A host that has genuinely closed its
 * tab is still noticed inside a minute, and nothing about play is gated on it.
 */
export const HOST_PRESENCE_WINDOW_MS = 60_000
// Mid-game resume only fires if the previous host pinged within this window. The
// relay retains a room's state for hours, so without this a host REUSING an old
// code would resume a stale/abandoned game (e.g. an expired open round that then
// auto-locks). Deliberately generous: it must comfortably exceed the worst-case
// page-reload-plus-reconnect time, because treating a genuine reload as stale would
// reset the room to the lobby and yank live players off their screens. Anything
// longer than this means the host has actually been gone, so a reuse starts fresh.
const RESUME_STALE_MS = 90_000
// CLASP frames are length-prefixed with a uint16, so a single published value
// can't exceed 65535 bytes. The game config is the one value that can grow (an
// inline/pasted data-URL image bloats it), and if its publish throws mid-start()
// the room is silently stranded in the lobby. Guard with headroom and fail loud.
const MAX_CONFIG_BYTES = 60_000
// How many times a host regenerates a colliding room code before giving up (each
// try is one relay round-trip; with ~1M codes, even one collision is rare).
const MAX_ROOM_CODE_TRIES = 5

/** The retained claim on a room code: which host instance owns it, and when that
 *  host last said so (by its own clock, read back only by itself). */
interface HostSession {
  token: string
  at: number
}

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
  /**
   * Optional dynamic timer: seconds for round `index` given its EFFECTIVE content
   * (the runtime-derived content when the round has one, else undefined; the
   * implementation falls back to the authored round). Lets a derived judge round
   * scale its window to the gallery the room actually has to read (6 mad-libs
   * stories vs 3 quips). When present it wins over `rounds[index].timer`; null
   * still means untimed. The engine never inspects the content.
   */
  timerFor?: (index: number, runtimeContent: RelayValue | undefined) => number | null
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
  /**
   * Whether a host reload may RESUME this game mid-play instead of resetting to
   * the lobby. Safe only when every answer key is STATIC (derivable from the
   * config), because runtime-derived/hidden-role answer keys live only in host
   * memory and are never on the relay (the withholding invariant), so a reload
   * can't reconstruct them. The app sets this true for games with no
   * derive/assign/fromShares round. Defaults to false (always reset to lobby).
   */
  resumable?: boolean
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
  /** Host only: a per-host-instance token the app persists across reload (e.g. in
   *  sessionStorage). It lets a reloaded host recognize its OWN live room and keep the
   *  code (so players aren't stranded), while a genuinely different host colliding on
   *  the same code still regenerates. Without it, a live code always reads as taken. */
  hostToken?: string
  /** Optional transform applied to a player's DISPLAY name wherever the roster is
   *  surfaced (the big screen, results, roster games). The app injects it (e.g. a
   *  profanity mask) so the engine stays content-policy-agnostic. The raw name is kept
   *  for identity (`pid = hash(room+name)`), so reconnect-by-name is unaffected. */
  nameFilter?: (name: string) => string
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
  /** The room code. Reactive because a host may regenerate a colliding code on
   *  connect, and the join code/QR on screen must follow. */
  code: string
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
  // Mutable so a host can regenerate a colliding code on connect (see
  // ensureFreeRoomCode); players/audience keep the exact code they were given.
  room: string
  readonly me: Identity

  private relay: RelayClient
  private now: () => number
  private ttlUs: number
  /** Host only: this host instance's token (see RoomRuntimeOptions.hostToken). */
  private hostToken: string | null
  /** Optional display-name transform (see RoomRuntimeOptions.nameFilter). */
  private nameFilter: ((name: string) => string) | null

  private state: RoomState = { ...INITIAL_STATE, round: { ...INITIAL_STATE.round } }
  private playersMap = new Map<string, Player>()
  /** Host-only: players the host has removed ("kicked"). The relay is trustless, so a
   *  kick can't force a client off; instead the host IGNORES them - they drop from the
   *  roster, the board, and scoring. In-memory + host-local (no relay write); cleared on
   *  a host reload. Keyed by pid, so a kicked player re-entering the same name stays out. */
  private ignoredPids = new Set<string>()
  /** Host-only: audience id -> last heartbeat, for the "N watching" count. */
  private audiencePings = new Map<string, number>()
  /** Audience votes (P4B). Host collects every spectator's; an audience member
   *  keeps its own. Key `${round}:${id}`. Kept apart from `inputs` so spectator
   *  votes never enter scoring. */
  private audienceVotes = new Map<string, RelayValue>()
  private inputs = new Map<string, RelayValue>() // key `${round}:${pid}`
  /** Bumped whenever `inputs` or `ignoredPids` change. `inputsFor` walks the WHOLE
   *  inputs map (all rounds x all players) and the host calls it straight from a
   *  template, so at party scale it ran on every render; the version lets the result
   *  be reused until something actually changes. */
  private inputsVersion = 0
  private inputsCache = new Map<number, { v: number; map: Map<string, RelayValue> }>()
  /** Bumped whenever the roster changes in a way anyone can see (a name, a team, a
   *  join). A heartbeat that only refreshes a timestamp does NOT bump it. */
  private rosterVersion = 0
  private rosterCache: { v: number; inputs: number; at: number; players: Player[] } | null = null
  /** Host-only presence sweep (see PRESENCE_SWEEP_MS): when it last ran, and the
   *  present set it last reported, so a quiet room costs nothing. */
  private lastPresenceSweep = 0
  private lastPresentKey: string | null = null
  /** Memo for the beat (see heartbeatMs), on the roster's own clock bucket. */
  private beatCache: { at: number; v: number; ms: number } | null = null
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
  /** When we LOCALLY last received a host heartbeat event. Beats carry no
   *  timestamp at all now, so this is the only time value involved and it is ours.
   *  See hostIsPresent. */
  private lastHostPingAt: number | null = null
  /** Removes the visibility listener that re-beats when a backgrounded tab returns. */
  private stopVisibilityWatch: (() => void) | null = null
  /** Host only: the room-code claim as it stood BEFORE we wrote our own, captured
   *  during the collision check. Resume has to read the previous instance's record,
   *  not the fresh one this connect is about to publish. */
  private priorSession: HostSession | null = null
  /** Non-host: the roster exactly as the host published it. Everyone downstream of
   *  the host reads this instead of tracking 150 heartbeats themselves. */
  private publishedRoster: Player[] | null = null
  /** Host only: signature of the roster we last published, so an unchanged room
   *  costs nothing. */
  private lastRosterKey: string | null = null
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
  private pendingEmit = false

  constructor(opts: RoomRuntimeOptions) {
    this.relay = opts.relay
    this.room = opts.room
    this.now = opts.now ?? Date.now
    this.ttlUs = opts.ttlUs ?? DEFAULT_TTL_US
    this.hostToken = opts.hostToken ?? null
    this.nameFilter = opts.nameFilter ?? null
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
    _now: () => number = Date.now,
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
    const [roster, prof] = await Promise.all([
      read(addr.roster(room)),
      read(addr.playerProfile(room, id)),
    ])
    // `hasProfile` is "this name has been used in this room" (so a reconnect can be
    // offered); profiles are retained for the room's life, which is what we want.
    const hasProfile = prof != null
    // Whether someone is on that name RIGHT NOW comes from the host's roster. The
    // host is the only client that hears every heartbeat, so it is the only one
    // that can answer this -- and reading its answer means no clock comparison and
    // no waiting a beat interval to find out.
    const live = Array.isArray(roster) ? (roster as Array<{ id?: string }>) : []
    const present = live.some((p) => p?.id === id)
    return { id, present, hasProfile }
  }

  /**
   * Count players currently live in a room (a heartbeat within the presence
   * window), for a soft pre-join capacity check. Subscribes briefly to the ping
   * addresses, collects the retained snapshots the relay delivers on subscribe,
   * then resolves the count. Fail-open: resolves 0 on any error, so a flaky relay
   * never wrongly turns a player away.
   */
  static async probeLiveCount(
    relay: RelayClient,
    room: string,
    _now: () => number = Date.now,
    timeoutMs = PROBE_GET_TIMEOUT_MS,
  ): Promise<number> {
    // One retained read of the host's roster, instead of subscribing to every
    // phone's heartbeat and counting what lands inside an arbitrary window.
    // Fail-open: 0 on any error or timeout, so a flaky relay never wrongly turns
    // a player away at the door.
    try {
      const roster = await Promise.race([
        relay.get(addr.roster(room)).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
      ])
      return Array.isArray(roster) ? roster.length : 0
    } catch {
      return 0
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  async connect(): Promise<void> {
    this.relay.onConnect(() => {
      this.connected = true
      this.reconnecting = false
      this.error = null
      // On a RE-connect, re-broadcast our presence immediately so the host's
      // presence window doesn't drop us during the gap (the heartbeat timer
      // survives a reconnect, but its next tick could be seconds away). A no-op
      // on the first connect, where no heartbeat has started yet.
      this.republishPresence()
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
    // A host must own a FREE code: if a live room already holds this one (a recent
    // host heartbeat), regenerate before subscribing/publishing so we never hijack
    // someone else's room. Players/audience keep the exact code they were given.
    if (this.me.role === 'host') {
      await this.ensureFreeRoomCode()
      // The claim itself is written after tryResumeMidGame below, which has to read
      // the PREVIOUS instance's claim before we overwrite it.
    }
    this.subscribe()
    // Seed connection state from the synchronous truth: onConnect may have
    // already fired (a shared relay can be connected before we register), in
    // which case the callback above never runs for this runtime.
    if (this.relay.connected) this.connected = true
    if (this.me.role === 'host') {
      // A host reload mid-game RESUMES from the relay's retained state (so players
      // aren't yanked back to the lobby), when the game is safe to resume. Else the
      // host is authoritative: publish the lobby phase so early joiners receive it
      // on subscribe. Either way we mark ourselves ready immediately.
      const resumed = await this.tryResumeMidGame()
      // Claim the code now, not before: `tryResumeMidGame` has to read the claim
      // the PREVIOUS instance left, and writing ours first would overwrite the
      // very timestamp it uses to tell a reload from an abandoned room.
      this.publishHostSession()
      if (!resumed) this.publish(addr.phase(this.room), 'lobby')
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

  /**
   * Beat again the moment a backgrounded tab comes back.
   *
   * Browsers throttle `setInterval` in a hidden tab hard: Chrome clamps to about
   * once a minute after five minutes hidden, and mobile Safari suspends it
   * outright when the screen locks. A 5s beat against a 16s window does not
   * survive that, so a host who switched tabs, or a phone whose screen locked,
   * reads as gone until the next tick that the browser deigns to run. Firing on
   * `visibilitychange` closes that gap on the way back in; the widened window
   * covers the way out.
   */
  private watchVisibility(): void {
    if (typeof document === 'undefined' || this.stopVisibilityWatch) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') this.republishPresence()
    }
    document.addEventListener('visibilitychange', onVisible)
    this.stopVisibilityWatch = () => document.removeEventListener('visibilitychange', onVisible)
  }

  /** Re-broadcast this client's liveness now (used on reconnect). No-op until a
   *  heartbeat has started, so it does nothing on the first connect. */
  private republishPresence(): void {
    if (!this.heartbeatTimer && !this.hostHeartbeatTimer) return
    if (this.me.role === 'player' && this.heartbeatTimer) {
      this.relay.emit(addr.playerPing(this.room, this.me.id))
    } else if (this.me.role === 'audience' && this.heartbeatTimer) {
      this.relay.emit(addr.audiencePing(this.room, this.me.id))
    } else if (this.me.role === 'host' && this.hostHeartbeatTimer) {
      this.relay.emit(addr.hostPing(this.room))
    }
  }

  private startAudienceHeartbeat(): void {
    if (this.heartbeatTimer || this.me.role !== 'audience') return
    this.watchVisibility()
    const beat = () => this.relay.emit(addr.audiencePing(this.room, this.me.id))
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
    this.watchVisibility()
    const beat = () => {
      this.relay.emit(addr.hostPing(this.room))
      this.publishHostSession()
    }
    beat()
    this.hostHeartbeatTimer = setInterval(beat, HOST_HEARTBEAT_INTERVAL_MS)
  }

  /**
   * Whether this room code already belongs to another host.
   *
   * Deliberately not a liveness question, because liveness across machines cannot
   * be answered without comparing their clocks, and getting it wrong here means
   * two hosts silently driving one room. Ownership can be answered exactly: a
   * retained session record with a token that is not ours means the code is
   * someone else's, so we pick another. A code stays claimed for the room's TTL
   * rather than being recycled the moment a host goes quiet, which costs us
   * nothing against a million codes and removes the hijack entirely.
   *
   * A relay hiccup reads as free, so a transient error never blocks hosting.
   */
  private async roomCodeTaken(code: string): Promise<boolean> {
    try {
      const session = (await this.relay.get(addr.hostSession(code))) as unknown as HostSession | undefined
      const owner = typeof session?.token === 'string' ? session.token : null
      if (code === this.room) this.priorSession = owner ? session ?? null : null
      if (!owner) return false // nobody has claimed it
      return owner !== this.hostToken // ours (a reload) -> keep it; anyone else's -> move on
    } catch {
      return false
    }
  }

  /** Ensure this host's `room` code isn't already held by a live room, regenerating
   *  a few times if needed. Called once on connect, before any subscribe/publish, so
   *  a new game can never land on (and hijack) someone else's room. */
  private async ensureFreeRoomCode(): Promise<void> {
    for (let attempt = 0; attempt < MAX_ROOM_CODE_TRIES; attempt++) {
      if (!(await this.roomCodeTaken(this.room))) return
      this.room = makeRoomCode()
    }
    // After many collisions (astronomically unlikely) keep the last code rather than
    // loop forever; a duplicate is far less likely than the relay being unreachable.
  }

  /**
   * Claim this room code and stamp when we last held it. Refreshed on the host's
   * beat so a reload can tell "I was driving this a moment ago" from "this is a
   * code I used at a party last night". `at` is only ever read back by a host
   * whose token matches, i.e. by this same machine, so it is never a cross-clock
   * comparison.
   */
  private publishHostSession(): void {
    if (this.me.role !== 'host' || !this.hostToken) return
    this.publish(addr.hostSession(this.room), { token: this.hostToken, at: this.now() })
  }

  /** Publish room meta (game id, title, theme) so players can render the lobby. */
  private publishMetaIfLoaded(): void {
    if (this.me.role !== 'host' || !this.game) return
    this.meta = this.game.meta
    this.publish(addr.meta(this.room), this.game.meta as unknown as RelayValue)
  }

  /**
   * Host reload recovery: if a mid-game room is still live on the relay, RESEED
   * local state from its retained values instead of resetting to the lobby, so a
   * host who refreshed (or whose tab crashed) lands back in the running game and
   * players are never yanked back to the waiting screen. Returns whether it
   * resumed (false → caller publishes the lobby phase as before).
   *
   * Safe only for `resumable` games (no runtime-derived/hidden-role answer keys,
   * which live only in host memory and are never on the relay). It READS retained
   * state and never PUBLISHES phase/round/config/answers, so it can't re-leak an
   * answer or reset live players. The static config + answer keys come from the
   * freshly loaded game (deterministic), the roster + inputs re-subscribe from the
   * relay, and the host heartbeat resumes right after this.
   */
  private async tryResumeMidGame(): Promise<boolean> {
    if (this.me.role !== 'host' || !this.game || !this.game.resumable) return false
    // Bound every read: a CLASP get on an ABSENT key hangs until the relay's own
    // multi-second timeout, and the delegated-driver key is absent in the common
    // (no MC) case. Race each against a short timeout so resume can never stall the
    // host connect; a timed-out read just means "no resume this time" (clean lobby).
    const get = (a: string): Promise<RelayValue | undefined> =>
      Promise.race([
        this.relay.get(a).catch(() => undefined),
        new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), PROBE_GET_TIMEOUT_MS)),
      ])
    const [phase, idx, rstate, deadline] = await Promise.all([
      get(addr.phase(this.room)),
      get(addr.roundIndex(this.room)),
      get(addr.roundState(this.room)),
      get(addr.roundDeadline(this.room)),
    ])
    // Only resume an ACTIVE (mid-round) game. 'lobby'/absent means a fresh start;
    // 'results' means the game ended (and the host doesn't retain its own results
    // summary), so a reload there just resets to the lobby as before.
    if (phase !== 'active') return false
    // Don't resume a STALE room. The relay keeps a room's state for hours, so if the
    // previous host stopped its heartbeat a while ago this 'active' state is leftover;
    // reusing the same code should start fresh, not restore it (the "reused a room and
    // open voting auto-locked" bug: an abandoned open round's deadline is long past, so
    // restoring it would auto-lock on the next tick). This freshness check is the ONLY
    // stale guard: a genuine reload pinged seconds ago and must resume normally, even
    // if its round's timer expired during the reload (the tick then locks + syncs the
    // round). Blocking that would reset live players to the lobby, which is worse than
    // a brief auto-lock.
    const prev = this.priorSession
    // Only OUR OWN room resumes, and the staleness check reads a timestamp this
    // machine wrote itself, so neither test involves another machine's clock.
    if (!this.hostToken || prev?.token !== this.hostToken) return false
    if (typeof prev.at !== 'number' || this.now() - prev.at >= RESUME_STALE_MS) return false
    const index = Number(idx) | 0
    // The freshly loaded config must actually contain this round (a guard against
    // a stale/mismatched retained pointer); else fall back to a clean lobby.
    if (index < 0 || index >= (this.game.rounds.length || 0)) return false
    this.state = {
      phase: phase as Phase,
      round: {
        index,
        state: typeof rstate === 'string' ? (rstate as RoundState) : 'ready',
        deadline: deadline == null ? null : Number(deadline),
      },
    }
    // Restore the delegated driver (co-host/MC) if one is set. (Reveal summaries
    // are not re-read: the host never reads its own roundReveals, players retain
    // theirs, and probing absent ones would stall the connect.)
    const driver = await get(addr.controlDriver(this.room))
    if (typeof driver === 'string' && driver.length) this.driverPid = driver
    return true
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
    this.stopVisibilityWatch?.()
    this.stopVisibilityWatch = null
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
      on(addr.hostPing(r), () => {
        // A heartbeat is an EVENT: it is never stored and never replayed, so the
        // fact that one arrived is the whole signal. No timestamp is sent, so
        // there is nothing to compare against our clock and nothing to go stale.
        this.lastHostPingAt = this.now()
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

    // Everyone except the audience needs to know who is in the room: roster games
    // like Most Likely To let you vote for another player. They READ it from the
    // host rather than working it out themselves.
    //
    // Only the HOST subscribes to the per-player profile/ping/team firehose. Every
    // client used to, which made presence cost N deliveries per beat to each of N
    // clients: at the 145-phone party that was ~2,100 relay deliveries a second, and
    // the code already called it the dominant cost of a big room. One writer, one
    // roster value, N readers makes it linear -- and it matches how phase, round and
    // config already work, so presence stops being the one thing 145 devices each
    // compute a slightly different answer to.
    if (this.me.role !== 'host' && this.me.role !== 'audience') {
      on(addr.roster(r), (v) => {
        this.publishedRoster = Array.isArray(v) ? (v as unknown as Player[]) : null
        this.rosterVersion++
        this.emit()
      })
    }
    if (this.me.role === 'host') {
    on(patterns.playerProfile(r), (v, a) => {
      const pid = pidFromPlayerAddress(a)
      if (!pid) return
      const prof = v as { name?: string; joinedAtIndex?: number }
      const prev = this.playersMap.get(pid)
      const next: Player = {
        id: pid,
        name: prof?.name ?? prev?.name ?? 'Player',
        joinedAtIndex: prof?.joinedAtIndex ?? prev?.joinedAtIndex ?? 0,
        // A profile is only published by an actively-joining client, so treat its
        // first arrival as a presence pulse (show them immediately, without waiting
        // for the heartbeat). `?? this.now()` only fires on first sight.
        lastPing: prev?.lastPing ?? this.now(),
        team: prev?.team, // preserve a team that arrived before the profile
      }
      this.playersMap.set(pid, next)
      // A reconnect replays every retained profile in the room; only the ones that
      // actually change the roster are worth a re-render.
      if (!prev || prev.name !== next.name || prev.joinedAtIndex !== next.joinedAtIndex) {
        this.rosterVersion++
        // Publish straight away rather than waiting for the presence sweep: a
        // player who has just joined wants to see their name on the big screen now.
        this.maybePublishRoster()
        this.emit()
      }
    })
    on(patterns.playerPing(r), (_v, a) => {
      const pid = pidFromPlayerAddress(a)
      if (!pid) return
      const prev = this.playersMap.get(pid)
      // Stamp OUR clock, not the phone's. A room is 150 devices whose clocks agree
      // only by luck; measuring their liveness by their own timestamps drops the
      // fast ones off the roster (and out of "everyone has answered") while they
      // are sitting there beating.
      const lastPing = this.now()
      const window = this.presenceWindow()
      const wasLive = prev?.lastPing != null && this.now() - prev.lastPing < window
      this.playersMap.set(pid, {
        id: pid,
        name: prev?.name ?? 'Player',
        joinedAtIndex: prev?.joinedAtIndex ?? 0,
        lastPing,
        team: prev?.team,
      })
      // A heartbeat is a timestamp nobody reads: the ONLY visible thing it can change
      // is whether that player counts as present. Every client hears every player's
      // beat, so re-rendering the room for each one is what makes a 200-phone room
      // crawl. Emit on a first sighting or a presence flip, and nothing else.
      const nowLive = this.now() - lastPing < window
      if (!prev || wasLive !== nowLive) {
        this.rosterVersion++
        this.emit()
      }
    })
    // Teams (when on): the host folds each player's team into the roster it
    // publishes, so the team board and colours reach everyone from there. A player
    // writes their own; the host may write any player's (assign / auto-balance).
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
      if (!prev || prev.team !== team) {
        this.rosterVersion++
        this.maybePublishRoster()
        this.emit()
      }
    })
    } // end host-only roster inputs

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
        this.inputsVersion++
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
    }
    if (this.me.role === 'host' || this.me.role === 'viewer') {
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
        this.inputsVersion++
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
        on(patterns.audiencePing(r), (_v, a) => {
          const id = a.split('/')[4]
          // Our clock, for the same reason as playerPing: a spectator's device
          // clock is not evidence about when we heard from them.
          if (id) this.audiencePings.set(id, this.now())
          this.emit()
        })
      }
    }
  }

  private publish(address: string, value: RelayValue): void | Promise<void> {
    return this.relay.set(address, value, { ttl: this.ttlUs, absolute: true })
  }

  /**
   * Publish without gating other state on it, but never let an offloaded value's
   * upload failure become an unhandled rejection: surface it instead. Use for
   * fire-and-forget publishes (a player's input, a custom channel, standings)
   * whose ordering does not gate anything else. Ordering-critical publishes
   * (results before the phase flip, derived content before the round advances)
   * `await this.publish(...)` directly.
   */
  private publishGuarded(address: string, value: RelayValue): void {
    const r = this.publish(address, value)
    if (r && typeof (r as Promise<void>).then === 'function') {
      ;(r as Promise<void>).catch((e) => this.reportError(e))
    }
  }

  /** Surface a non-fatal error to the UI (the reactive snapshot renders it). */
  private reportError(error: unknown): void {
    this.error = error instanceof Error ? error.message : String(error)
    this.emit()
  }

  /** Throw a clear, host-facing error if a config is too big to fit one relay
   *  frame, BEFORE it half-publishes and strands the room. The usual cause is an
   *  inline/pasted data-URL image; uploading it (a short URL) fixes it. */
  private assertConfigBroadcastable(config: RelayValue): void {
    let bytes = 0
    try {
      bytes = JSON.stringify(config)?.length ?? 0
    } catch {
      return // non-serializable: let the relay encode surface it
    }
    if (bytes > MAX_CONFIG_BYTES) {
      const kb = Math.round(bytes / 1024)
      const limit = Math.round(MAX_CONFIG_BYTES / 1024)
      throw new Error(
        `This game is too large to broadcast to players (${kb} KB, limit about ${limit} KB). An inline or pasted image is the usual cause. Upload the image or use an image URL instead.`,
      )
    }
  }

  // ---- reads ---------------------------------------------------------------

  getSnapshot(): RoomSnapshot {
    return {
      code: this.room,
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
   * a false "host gone" (a truly dead room is caught by the join timeout).
   *
   * Measured entirely on OUR clock: `lastHostPingAt` is when this device saw the
   * host beat, not what the host's clock said at the time. Comparing the host's
   * timestamp to ours (what this used to do) meant any device more than a window
   * out of sync declared a perfectly healthy host gone -- and since `canSubmit`
   * hung off this flag, that greyed out "Lock it in" for as long as the drift
   * lasted. Clocks disagree; arrival times do not.
   */
  private hostIsPresent(): boolean {
    if (this.me.role === 'host') return true
    if (this.lastHostPingAt == null) return true
    return this.now() - this.lastHostPingAt < HOST_PRESENCE_WINDOW_MS
  }

  onChange(listener: Listener): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    // Coalesce bursts into one listener notification per microtask. A reconnect
    // replays the whole retained snapshot (100+ params at party scale), each
    // firing emit; without this that is 100+ full snapshot recomputes in one
    // tick. The engine's own logic reads `this.state` synchronously, so only the
    // reactive mirror is deferred, invisible to callers and tests.
    if (this.pendingEmit) return
    this.pendingEmit = true
    queueMicrotask(() => {
      this.pendingEmit = false
      for (const l of this.listeners) l()
    })
  }

  /**
   * The beat this room is currently using, from the LIVE roster.
   *
   * Deliberately not `playersMap.size`: that map is never pruned, so it counts every
   * player ever seen and a room that emptied out would keep a big room's slow beat
   * forever. Counted against the widest window any pacing can produce, so this never
   * depends on the beat it is computing, and memoized on the same coarse clock bucket
   * as the roster since the ping handler asks for it on every inbound heartbeat.
   */
  private heartbeatMs(): number {
    const bucket = Math.floor(this.now() / PRESENCE_TICK_BUCKET_MS)
    if (this.beatCache?.at === bucket && this.beatCache.v === this.rosterVersion) return this.beatCache.ms
    // Count against the BASE window, not the widest one. A live player always beats
    // inside it (the cap keeps every beat under it), while a player who left drops
    // out promptly - so the count only falls as people leave, and the window derived
    // from it cannot widen again and resurrect names that had already aged off.
    const cutoff = this.now() - PRESENCE_WINDOW_MS
    let live = 0
    for (const p of this.playersMap.values()) if (p.lastPing != null && p.lastPing > cutoff) live++
    const ms = heartbeatIntervalFor(live)
    this.beatCache = { at: bucket, v: this.rosterVersion, ms }
    return ms
  }
  /** How stale a player's last beat may be before they read as gone. Widens with the
   *  beat, so a big room's slower heartbeat still gets four missed beats of grace. */
  private presenceWindow(): number {
    return presenceWindowFor(this.heartbeatMs())
  }

  /**
   * Players considered present: a recent heartbeat, or any submitted input.
   * Keeping players who have answered (even if their heartbeat lapsed) is
   * intentional so scoring counts everyone who played.
   *
   * Memoized: this allocates a Set over every input key plus a fresh Player per
   * member, and `getSnapshot` calls it on EVERY snapshot read (the host ticks four
   * times a second). Presence also depends on the clock, so the memo expires on a
   * coarse time bucket as well as on roster/input changes.
   */
  recentPlayers(): Player[] {
    // Everyone but the host reads the roster the host published. It is the same
    // answer, arrived at once instead of 150 times, and it is authoritative: the
    // host is the only client that hears every heartbeat.
    if (this.me.role !== 'host') return this.publishedRoster ?? []
    const now = this.now()
    const bucket = Math.floor(now / PRESENCE_TICK_BUCKET_MS)
    const cached = this.rosterCache
    if (cached && cached.v === this.rosterVersion && cached.inputs === this.inputsVersion && cached.at === bucket) {
      return cached.players
    }
    const window = this.presenceWindow()
    const pidsWithInput = new Set<string>()
    for (const key of this.inputs.keys()) {
      pidsWithInput.add(key.slice(key.indexOf(':') + 1))
    }
    const out: Player[] = []
    for (const [pid, p] of this.playersMap) {
      if (this.ignoredPids.has(pid)) continue // host kicked them: drop from the roster
      const live = p.lastPing != null && now - p.lastPing < window
      if (live || pidsWithInput.has(pid)) out.push({ ...p, name: this.displayName(p.name) })
    }
    this.rosterCache = { v: this.rosterVersion, inputs: this.inputsVersion, at: bucket, players: out }
    return out
  }

  /** A player's name as shown on the roster/board, with the optional name filter
   *  applied (e.g. a profanity mask). Identity (pid) is unaffected: it derives from
   *  the raw name, so reconnect-by-name still works. */
  private displayName(name: string): string {
    return this.nameFilter ? this.nameFilter(name) : name
  }

  /** This player's own submission for a round (for restore). */
  inputFor(roundIndex: number): RelayValue | undefined {
    return this.inputs.get(`${roundIndex}:${this.me.id}`)
  }

  /**
   * All submissions for a round, keyed by player id (host only).
   *
   * Memoized per round against `inputsVersion`: this walks the WHOLE inputs map
   * (every round x every player) and the generic host renders it straight from a
   * template, so without the memo a 200-player room rebuilt every round's map on
   * every render. Callers only read the result, so the cached Map is shared.
   */
  inputsFor(roundIndex: number): Map<string, RelayValue> {
    const hit = this.inputsCache.get(roundIndex)
    if (hit && hit.v === this.inputsVersion) return hit.map
    const out = new Map<string, RelayValue>()
    const prefix = `${roundIndex}:`
    for (const [key, value] of this.inputs) {
      if (!key.startsWith(prefix)) continue
      const pid = key.slice(prefix.length)
      // A kicked player's submissions never reach the board, the derive, or scoring.
      if (pid && !this.ignoredPids.has(pid)) out.set(pid, value)
    }
    this.inputsCache.set(roundIndex, { v: this.inputsVersion, map: out })
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
    this.inputsVersion++
    // A dense drawing can exceed one relay frame; publishGuarded offloads it and
    // surfaces (never crashes on) an upload failure.
    this.publishGuarded(addr.input(this.room, i, this.me.id), input)
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
    this.rosterVersion++ // the memoized roster must see the new team at once
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
    // A player keeps its own pick locally (set the moment they tap, so the button
    // responds without a relay round trip) and otherwise reads the host's roster,
    // which is what carries a team the HOST assigned during an auto-balance.
    const mine = this.playersMap.get(this.me.id)?.team
    if (mine !== undefined) return mine ?? null
    return this.recentPlayers().find((p) => p.id === this.me.id)?.team ?? null
  }

  // ---- custom channels (for custom-flow games) -----------------------------

  /**
   * Publish to a game-defined custom channel under `/<room>/x/<key>`. Lets a
   * custom-flow game (the Circuit Cypher battle, live cheers, ...) drive its own
   * state over the relay without bypassing the engine, TTL-scoped like everything
   * else. Any role may publish.
   */
  publishExtra(key: string, value: RelayValue): void {
    this.publishGuarded(addr.extra(this.room, key), value)
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

  /**
   * Beat this client's presence, re-pacing as the room fills. Every beat costs one
   * delivery to every other client, so a room that grows past a comfortable roster
   * slows its beat (and widens its staleness window to match) instead of turning the
   * relay into a heartbeat firehose. The cadence is re-checked on each beat, so a
   * room that empties out speeds back up on its own.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer || this.me.role !== 'player') return
    this.watchVisibility()
    let paced = this.heartbeatMs()
    const beat = () => {
      this.relay.emit(addr.playerPing(this.room, this.me.id))
      const next = this.heartbeatMs()
      if (next !== paced && this.heartbeatTimer) {
        paced = next
        clearInterval(this.heartbeatTimer)
        this.heartbeatTimer = setInterval(beat, next)
      }
    }
    beat()
    this.heartbeatTimer = setInterval(beat, paced)
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

  /** Host removes a disruptive player ("kick"): they drop from the roster, the board,
   *  and scoring. Host-local + in-memory (no relay write, since the relay is trustless
   *  and can't force a client off); keyed by pid, so re-entering the same name stays out.
   *  Cleared on a host reload. {@link unkickPlayer} reverses an accidental kick. */
  kickPlayer(pid: string): void {
    this.assertHost()
    if (!pid) return
    this.ignoredPids.add(pid)
    this.inputsVersion++
    // If we kicked the delegated driver (co-host/MC), revoke their driving too, else a
    // kicked-but-still-connected client could keep sending drive commands.
    if (pid === this.driverPid) this.setDriver(null)
    this.emit()
  }

  /** Reverse a kick (e.g. an accidental one): the player rejoins the roster/scoring. */
  unkickPlayer(pid: string): void {
    this.assertHost()
    if (this.ignoredPids.delete(pid)) {
      this.inputsVersion++
      this.emit()
    }
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

  /** P4B: turn on/off "the crowd's votes count" for scored judge rounds. Republishes
   *  meta so the audience phone shows a vote surface. Ephemeral lobby control, mirrors
   *  setTeams. Host only. */
  setCrowdCounts(on: boolean): void {
    this.assertHost()
    const base = this.meta ?? this.game?.meta
    if (!base) return
    this.meta = { ...base, crowdCounts: on ? true : undefined }
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
    // The host keeps the full config locally (for scoring); the relay gets the
    // redacted one so spectators cannot read answers early.
    const publishConfig = this.game.publishConfig ?? this.game.config
    // Fail BEFORE any publish so an oversized config never half-starts the room.
    this.assertConfigBroadcastable(publishConfig)
    this.meta = this.game.meta
    this.config = this.game.config
    this.publish(addr.meta(this.room), this.game.meta as unknown as RelayValue)
    this.publish(addr.config(this.room), publishConfig)
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
    // A derived gallery (all drawings/photos to vote on) can exceed one frame;
    // publishGuarded offloads it and surfaces (never crashes on) an upload failure.
    // The content arrives via its own subscription, so brief lateness just delays
    // the options appearing, it does not desync the round.
    this.publishGuarded(addr.roundContent(this.room, index), derived.publish)
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
    // A per-player payload can carry a neighbor's full drawing (chain games); each
    // offloads independently via publishGuarded (upload failures surface, never crash).
    for (const [pid, content] of Object.entries(assigned.perPlayer)) {
      this.publishGuarded(addr.roundContentForPlayer(this.room, index, pid), content)
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
    const i = this.state.round.index
    // Dynamic timer first (a derived gallery scales its window to its content),
    // else the static per-round timing computed at load.
    const timer = this.game?.timerFor
      ? this.game.timerFor(i, this.runtimeContent.get(i))
      : (this.game?.rounds[i]?.timer ?? null)
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
    if (answer !== undefined) this.publishGuarded(addr.roundAnswer(this.room, i), answer)
    // Publish a public reveal summary (vote tallies, the winner) so phones can show
    // personal feedback. A summary that embeds drawings (drawvote) can offload;
    // publishGuarded handles that without gating the reveal, so play never stalls.
    const summary = this.game?.revealSummary?.(i, (j) => this.inputsFor(j))
    if (summary !== undefined) {
      this.roundReveals.set(i, summary)
      this.publishGuarded(addr.roundReveal(this.room, i), summary)
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
    this.publishGuarded(addr.standings(this.room), summary)
    this.emit()
  }

  /**
   * End the game and publish the results summary the plugin computed. A rich
   * results value (a chain game's whole filmstrip of drawings) can exceed one
   * relay frame, so we await the publish: if it offloads, the reference is on the
   * relay before the phase flips to `results`, so no client lands on an empty
   * results screen. If it cannot be broadcast at all (oversized, no storage), we
   * surface the friendly error and stay in play rather than stranding the room.
   */
  async finish(summary: RelayValue): Promise<void> {
    this.assertHost()
    this.results = summary
    try {
      await this.publish(addr.resultsSummary(this.room), summary)
    } catch (e) {
      this.reportError(e)
      return
    }
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
    // Fail before wiping the previous game if the next one is too large to broadcast.
    this.assertConfigBroadcastable(game.publishConfig ?? game.config)
    const prevRounds = this.game?.rounds.length ?? 0
    // Clear only what the previous game actually WROTE. The old form published a null
    // for every (round x player) pair, which is R*(3+2N) frames in one synchronous
    // loop: over 8,000 for a 20-round game with 200 phones, almost all of them for
    // addresses that were never set. The host holds every input it has seen (it
    // subscribes to `input/*/*`) and records which rounds it assigned per-player
    // content to, so those two sets are exactly the addresses that need clearing.
    for (let i = 0; i < prevRounds; i++) {
      this.publish(addr.roundContent(this.room, i), null)
      this.publish(addr.roundReveal(this.room, i), null)
      this.publish(addr.roundAnswer(this.room, i), null)
    }
    for (const key of this.inputs.keys()) {
      const parsed = key.split(':')
      const i = Number.parseInt(parsed[0] ?? '', 10)
      const pid = parsed.slice(1).join(':')
      if (!Number.isNaN(i) && pid) this.publish(addr.input(this.room, i, pid), null)
    }
    // Secret per-player content exists only for a game that declares `assignContent`,
    // and NOTHING subscribes to another player's secret channel, so a host cannot read
    // back what it (or a previous host instance, before a reload) published there.
    // For those games the sweep therefore stays exhaustive; every other game skips it
    // entirely, which is what takes the cost off the common path.
    if (this.game?.assignContent) {
      const pids = this.recentPlayers().map((p) => p.id)
      for (let i = 0; i < prevRounds; i++) {
        for (const pid of pids) this.publish(addr.roundContentForPlayer(this.room, i, pid), null)
      }
    }
    this.publish(addr.standings(this.room), null)
    this.publish(addr.resultsSummary(this.room), null)
    this.publish(addr.controlCommand(this.room), null)
    this.lastCommandNonce = null
    this.incomingCommand = null
    // Clear local ephemeral state for the previous game.
    this.inputs.clear()
    this.inputsVersion++
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

  /** Drive the countdown, auto-lock when a timed round's deadline passes, and notice
   *  anyone who has gone quiet. */
  tick(now: number = this.now()): void {
    if (this.me.role !== 'host') return
    if (shouldAutoLock(this.state, now)) this.lock()
    this.sweepPresence(now)
  }

  /**
   * Publish the roster, but only when it has actually changed.
   *
   * The host is the single writer here, the same as phase/round/config. The
   * signature covers everything a reader can see (who, their name, team, join
   * point, and whether they are live), so a room where nothing changed publishes
   * nothing at all -- which mid-game is almost every tick.
   */
  private maybePublishRoster(): void {
    if (this.me.role !== 'host') return
    const roster = this.recentPlayers()
    const key = roster.map((p) => `${p.id}:${p.name}:${p.team ?? ''}:${p.joinedAtIndex}`).join('|')
    if (key === this.lastRosterKey) return
    this.lastRosterKey = key
    // `lastPing` is deliberately dropped: it is a local arrival time on THIS
    // machine and would mean nothing to anyone else. Presence is already baked
    // into which players are in the list at all.
    this.publish(
      addr.roster(this.room),
      roster.map((p) => ({
        id: p.id,
        name: p.name,
        joinedAtIndex: p.joinedAtIndex,
        ...(p.team ? { team: p.team } : {}),
      })) as unknown as RelayValue,
    )
  }

  /**
   * Notice a player (or spectator) who simply stopped beating. Nothing arrives on the
   * relay when someone closes a tab, so without this the host roster would keep
   * showing them until some unrelated message happened to land. Emits ONLY when the
   * present set changed, so an idle room still does no work.
   */
  private sweepPresence(now: number): void {
    if (now - this.lastPresenceSweep < PRESENCE_SWEEP_MS) return
    this.lastPresenceSweep = now
    const key = `${this.recentPlayers().map((p) => p.id).join(',')}|${this.audienceCount()}`
    this.maybePublishRoster()
    if (key === this.lastPresentKey) return
    this.lastPresentKey = key
    this.emit()
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
