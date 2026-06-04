<script setup lang="ts">
/**
 * Hosts a game on the big screen. Client-only (it opens a CLASP connection):
 * it creates a room, loads the plugin's default composition (publishing a
 * redacted config), provides the room, and renders the game's Host view, the
 * generic block renderer, or the plugin's own override.
 */
import { type RelayValue, type RoomMeta, createClaspRelay, makeRoomCode } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import {
  GameHost,
  buildAssignContent,
  buildDeriveContent,
  buildRevealSummary,
  type FilterTier,
  gameAnswerKeys,
  gameRounds,
  getPlugin,
  inlineDecks,
  maskDerivedPublish,
  poolRowsFor,
  redactGameConfig,
  resolveComposition,
} from '@doot-games/games'
import { DootLogo, Stage } from '@doot-games/ui'
import { computed, provide, reactive, ref, watch } from 'vue'

import type { GameComposition, ScorePlayer } from '@doot-games/sdk'

const props = defineProps<{
  pluginId: string
  /** An explicit composition to host (a saved game); falls back to the draft, then the default deck. */
  config?: GameComposition
  /** Theme to host under; falls back to the global theme selection. */
  themeId?: string
}>()
const runtime = useRuntimeConfig()

const plugin = getPlugin(props.pluginId)
if (!plugin) throw createError({ statusCode: 404, statusMessage: `Unknown game type: ${props.pluginId}` })
// A definitely-defined alias so the load()/resolveConfig() closures keep the
// narrowing (control-flow narrowing of `plugin` doesn't extend into closures).
const game = plugin

const themeState = useState<string>('doot-theme', () => 'doot')
const roomCode = makeRoomCode()
const relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-host' })
const room = useDootRoom({ relay, room: roomCode, role: 'host' })
provideDootRoom(room)

// Precedence: an explicit config (a saved game) > the editor draft (if it's for
// this game type) > a fresh pool sample (replayable flagships) > the default deck.
const draft = useGameDraft()
const fromDraft = draft.value && draft.value.pluginId === plugin.manifest.id ? draft.value : null
// Theme precedence: a saved game's theme > the draft's theme (survives a host-tab
// reload via the persisted draft) > the global selection.
const themeId = props.themeId ?? fromDraft?.themeId ?? themeState.value
themeState.value = themeId // adopt it for the whole host shell

// The roster, read lazily at derive/reveal time (it changes as players join).
// Read the runtime's authoritative roster directly rather than the reactive
// snapshot: derive/reveal run synchronously inside host actions, and the Vue
// computed can lag, which would drop author names from a derived round's reveal.
const getPlayers = (): ScorePlayer[] =>
  room.runtime.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))

// A creator's attached content deck (a saved pool game carries it under the reserved
// `pool` key in config.decks). `inlineDecks` unwraps it to a Deck; a `{ref}` is already
// resolved to inline server-side on the play read, and a dropped/unreadable ref is absent.
const poolDeckInline = game.contentPool ? inlineDecks(props.config?.decks)['pool'] : undefined

// For a pooled flagship, let the host pick the round count from the lobby. True for a
// fresh-hosted flagship, OR a saved game that attaches a creator pool deck (so the
// slider re-samples their deck). Provided to the GameHost lobby. Null otherwise.
const usesPool = (!props.config && !fromDraft && !!game.buildConfig) || (!!poolDeckInline && !!game.buildConfig)
const roundConfig =
  usesPool && game.roundOptions ? reactive({ ...game.roundOptions, value: game.roundOptions.default }) : null
provide('dootRoundConfig', roundConfig)

// Optional soft player cap, set by the host from the lobby. Changing it republishes
// meta so the join screen can turn away a new player once the room is at the cap.
const playerCap = ref<number | null>(null)
provide('dootPlayerCap', playerCap)
watch(playerCap, (cap) => {
  if (room.phase.value === 'lobby') room.host.setPlayerCap(cap)
})

// Optional "turn off timers" toggle, set from the lobby. Timers are on by default;
// when off, every round's timer is nulled so nothing auto-locks and the host (or
// the delegated driver) advances each round by hand.
const timersOff = ref(false)
provide('dootTimersOff', timersOff)

// Optional content filter (off / moderate / strict), set from the lobby. Masks the
// flagged words in the derived gallery text before it is published, so the room
// never sees them on the big screen. Read at derive time (lobby-only choice).
const contentFilter = ref<FilterTier>('off')
provide('dootContentFilter', contentFilter)

/** Null out every round's timer when the host turned timers off. */
function applyTimers(config: GameComposition): GameComposition {
  if (!timersOff.value) return config
  return {
    ...config,
    rounds: config.rounds.map((r) => ({
      ...r,
      content: { ...(r.content as Record<string, unknown>), timer: null },
    })),
  }
}

function resolveConfig(): GameComposition {
  // A saved game that attaches a creator pool deck: re-run buildConfig over THEIR rows
  // (not the frozen config.rounds), so it stays replayable + honors the round slider.
  if (game.buildConfig && game.contentPool && poolDeckInline) {
    const rows = poolRowsFor(game.contentPool, poolDeckInline)
    return applyTimers(game.buildConfig(roomCode, { rounds: roundConfig?.value, rows }))
  }
  if (props.config) return applyTimers(props.config)
  if (fromDraft?.config) return applyTimers(fromDraft.config)
  if (game.buildConfig)
    return applyTimers(game.buildConfig(roomCode, roundConfig ? { rounds: roundConfig.value } : undefined))
  return applyTimers(game.defaultConfig)
}

function load() {
  // Expand any deck-backed rounds (draw/bindings/pool) into plain rounds for play.
  // A no-op for games without decks, so existing games are unchanged.
  const config = resolveComposition(game, resolveConfig(), roomCode)
  const baseDerive = buildDeriveContent(game, config, roomCode, getPlayers, (i) => room.answerKeyFor(i))
  const meta: RoomMeta = {
    pluginId: game.manifest.id,
    pluginVersion: game.manifest.version,
    title: config.title || game.manifest.name,
    themeId,
  }
  room.host.loadGame({
    meta,
    config: config as unknown as RelayValue,
    publishConfig: redactGameConfig(game, config) as unknown as RelayValue,
    rounds: gameRounds(game, config),
    answerKeys: gameAnswerKeys(game, config) as unknown as Record<number, RelayValue>,
    // Two-phase wiring: derive a round's content from earlier inputs at runtime,
    // and publish a public reveal summary so phones can show personal feedback.
    // The derive output is run through the host's content filter before publish.
    deriveContent: ((index: number, inputsFor: (i: number) => Map<string, unknown>) => {
      const out = baseDerive(index, inputsFor)
      return out ? { ...out, publish: maskDerivedPublish(out.publish, contentFilter.value) } : out
    }) as never,
    assignContent: buildAssignContent(game, config, roomCode, getPlayers) as never,
    revealSummary: buildRevealSummary(
      game,
      config,
      getPlayers,
      (i) => room.runtimeContentFor(i),
      (i) => room.answerKeyFor(i),
    ) as never,
  })
}
load()
// Re-sample when the host changes the round count in the lobby (before start only).
if (roundConfig) watch(() => roundConfig.value, () => { if (room.phase.value === 'lobby') load() })
// Re-load with/without timers when the host toggles them (lobby only).
watch(timersOff, () => { if (room.phase.value === 'lobby') load() })

const HostView = plugin.components?.Host ?? GameHost
const playerCount = computed(() => room.players.value.length)
</script>

<template>
  <Stage>
    <template #bar>
      <NuxtLink to="/" class="home-link" aria-label="Doot home"><DootLogo :size="40" /></NuxtLink>
      <div class="bar-right">
        <span class="chip">{{ playerCount }} {{ playerCount === 1 ? 'player' : 'players' }}</span>
        <span class="chip" :class="room.connected.value ? 'live' : 'dead'">
          {{ room.connected.value ? 'connected' : 'connecting…' }}
        </span>
        <span class="code mono">{{ roomCode }}</span>
      </div>
    </template>
    <component :is="HostView" :plugin="plugin" />
  </Stage>
</template>

<style scoped>
.home-link {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
  border-radius: 10px;
}
.home-link:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 3px;
}
.bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  font-size: 13px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  border-radius: 999px;
  padding: 6px 13px;
}
.chip.live {
  color: var(--c5);
}
.chip.dead {
  color: var(--mute);
}
.code {
  font-weight: 700;
  font-size: 22px;
  letter-spacing: 0.3em;
  color: var(--primary);
  padding-left: 0.3em;
}
</style>
