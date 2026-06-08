/**
 * Vue bindings for the engine. `useDootRoom` mounts a {@link RoomRuntime},
 * mirrors its state into reactive refs, drives the host countdown loop, and
 * tears everything down on scope dispose. This is the single surface a game's
 * views consume, they never touch CLASP. See PRD section 7.6.
 */
import { computed, inject, onScopeDispose, type InjectionKey, provide, shallowRef } from 'vue'
import { RoomRuntime, type RoomRuntimeOptions } from '../room'
import type { HostAction } from '../state-machine'

const HOST_TICK_MS = 250
// Players/viewers receive no relay traffic while idle (e.g. after submitting), but
// `hostPresent` is time-based, so without a local tick a host that went away is
// never noticed and the "host left" banner never shows. Refresh on a slow cadence.
const PRESENCE_TICK_MS = 4000

export interface UseDootRoomOptions extends RoomRuntimeOptions {
  /** Auto-connect on creation (default true). */
  autoConnect?: boolean
  /** Called if the initial connect rejects. */
  onConnectError?: (err: unknown) => void
}

export function useDootRoom(options: UseDootRoomOptions) {
  const runtime = new RoomRuntime(options)
  const snapshot = shallowRef(runtime.getSnapshot())
  const refresh = () => {
    snapshot.value = runtime.getSnapshot()
  }
  const off = runtime.onChange(refresh)

  let tick: ReturnType<typeof setInterval> | null = null
  if (options.role === 'host') {
    tick = setInterval(() => runtime.tick(), HOST_TICK_MS)
  } else {
    // Re-evaluate the time-based snapshot (hostPresent) so an idle player notices
    // the host going away without needing an inbound relay message.
    tick = setInterval(refresh, PRESENCE_TICK_MS)
  }

  if (options.autoConnect !== false) {
    runtime.connect().catch((err) => {
      options.onConnectError?.(err)
    })
  }

  onScopeDispose(() => {
    if (tick) clearInterval(tick)
    off()
    runtime.dispose()
  })

  return {
    runtime,
    // reactive reads
    phase: computed(() => snapshot.value.phase),
    round: computed(() => snapshot.value.round),
    players: computed(() => snapshot.value.players),
    me: computed(() => snapshot.value.me),
    config: computed(() => snapshot.value.config),
    meta: computed(() => snapshot.value.meta),
    results: computed(() => snapshot.value.results),
    standings: computed(() => snapshot.value.standings),
    theme: computed(() => snapshot.value.meta?.themeId ?? null),
    connected: computed(() => snapshot.value.connected),
    reconnecting: computed(() => snapshot.value.reconnecting),
    error: computed(() => snapshot.value.error),
    ready: computed(() => snapshot.value.ready),
    isHost: computed(() => snapshot.value.me.role === 'host'),
    isAudience: computed(() => snapshot.value.me.role === 'audience'),
    hostPresent: computed(() => snapshot.value.hostPresent),
    audienceCount: computed(() => snapshot.value.audienceCount),
    joinedAtIndex: computed(() => snapshot.value.joinedAtIndex),
    // co-host / MC delegation
    driverPid: computed(() => snapshot.value.driverPid),
    isDriver: computed(() => snapshot.value.isDriver),
    command: computed(() => snapshot.value.command),

    // player actions
    submit: (input: Parameters<RoomRuntime['submit']>[0]) => runtime.submit(input),
    sendControl: (action: Parameters<RoomRuntime['sendControl']>[0]) => runtime.sendControl(action),
    // audience action (P4B): a spectator votes on a poll.
    submitAudience: (vote: Parameters<RoomRuntime['submitAudience']>[0]) => runtime.submitAudience(vote),
    audienceVotesFor: (i: number) => {
      void snapshot.value
      return runtime.audienceVotesFor(i)
    },
    // teams: a player picks (or the host assigns) a team in the lobby.
    setTeam: (team: string | null) => runtime.setTeam(team),
    myTeam: computed(() => {
      void snapshot.value
      return runtime.myTeam
    }),
    // custom channels (custom-flow games)
    publishExtra: (key: string, value: Parameters<RoomRuntime['publishExtra']>[1]) =>
      runtime.publishExtra(key, value),
    onExtra: (keyPattern: string, cb: Parameters<RoomRuntime['onExtra']>[1]) =>
      runtime.onExtra(keyPattern, cb),
    // inputFor/inputsFor touch the reactive snapshot first so that a computed
    // calling them re-evaluates on every relay update (e.g. a vote arriving).
    // The runtime's maps are plain (non-reactive); the snapshot is the signal.
    inputFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.inputFor(roundIndex)
    },

    // host aggregation
    inputsFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.inputsFor(roundIndex)
    },
    // two-phase reads (runtime-derived content, per-round reveal, answer key).
    // Touch the snapshot first so computeds re-run when these arrive.
    runtimeContentFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.runtimeContentFor(roundIndex)
    },
    // This player's own SECRET per-round content (hidden-role games).
    perPlayerContentFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.perPlayerContentFor(roundIndex)
    },
    roundRevealFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.roundRevealFor(roundIndex)
    },
    answerKeyFor: (roundIndex: number) => {
      void snapshot.value
      return runtime.answerKeyFor(roundIndex)
    },

    // host actions
    host: {
      loadGame: (game: Parameters<RoomRuntime['loadGame']>[0]) => runtime.loadGame(game),
      start: () => runtime.start(),
      openVoting: () => runtime.openVoting(),
      lock: () => runtime.lock(),
      reveal: () => runtime.reveal(),
      next: () => runtime.next(),
      finish: (summary: Parameters<RoomRuntime['finish']>[0]) => runtime.finish(summary),
      nextGame: (game: Parameters<RoomRuntime['nextGame']>[0]) => runtime.nextGame(game),
      publishStandings: (summary: Parameters<RoomRuntime['publishStandings']>[0]) =>
        runtime.publishStandings(summary),
      setPlayerCap: (cap: number | null) => runtime.setPlayerCap(cap),
      setDriver: (pid: string | null) => runtime.setDriver(pid),
      setTeams: (names: string[] | null) => runtime.setTeams(names),
      assignTeam: (pid: string, team: string | null) => runtime.assignTeam(pid, team),
      can: (action: HostAction['type']) => runtime.can(action),
    },
  }
}

export type DootRoom = ReturnType<typeof useDootRoom>

/** Injection key for sharing a room with plugin view components. */
export const DOOT_ROOM_KEY: InjectionKey<DootRoom> = Symbol('doot-room')

/** The shell calls this after `useDootRoom` so plugin components can inject it. */
export function provideDootRoom(room: DootRoom): void {
  provide(DOOT_ROOM_KEY, room)
}

/** Plugin view components (Host/Player/Results) call this to reach the room. */
export function injectDootRoom(): DootRoom {
  const room = inject(DOOT_ROOM_KEY)
  if (!room) throw new Error('No Doot room provided. Wrap views with provideDootRoom().')
  return room
}
