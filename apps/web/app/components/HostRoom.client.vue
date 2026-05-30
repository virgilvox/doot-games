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
  buildDeriveContent,
  buildRevealSummary,
  gameAnswerKeys,
  gameRounds,
  getPlugin,
  redactGameConfig,
} from '@doot-games/games'
import { DootLogo, Stage } from '@doot-games/ui'
import { computed, provide, reactive, watch } from 'vue'

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

// For a pooled flagship hosted fresh (not a saved/draft game), let the host pick
// the round count from the lobby. Provided to the GameHost lobby; changing it
// re-samples the deck (lobby only). Null for saved/draft/non-pooled games.
const usesPool = !props.config && !fromDraft && !!game.buildConfig
const roundConfig =
  usesPool && game.roundOptions ? reactive({ ...game.roundOptions, value: game.roundOptions.default }) : null
provide('dootRoundConfig', roundConfig)

function resolveConfig(): GameComposition {
  if (props.config) return props.config
  if (fromDraft?.config) return fromDraft.config
  if (game.buildConfig) return game.buildConfig(roomCode, roundConfig ? { rounds: roundConfig.value } : undefined)
  return game.defaultConfig
}

function load() {
  const config = resolveConfig()
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
    deriveContent: buildDeriveContent(game, config, roomCode, getPlayers) as never,
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

const HostView = plugin.components?.Host ?? GameHost
const playerCount = computed(() => room.players.value.length)
</script>

<template>
  <Stage>
    <template #bar>
      <DootLogo :size="40" />
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
