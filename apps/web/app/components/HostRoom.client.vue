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
import { computed } from 'vue'

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

const themeState = useState<string>('doot-theme', () => 'doot')
const roomCode = makeRoomCode()
const relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-host' })
const room = useDootRoom({ relay, room: roomCode, role: 'host' })
provideDootRoom(room)

// Precedence: an explicit config (a saved game) > the editor draft (if it's for
// this game type) > a fresh pool sample (replayable flagships) > the default deck.
const draft = useGameDraft()
const fromDraft = draft.value && draft.value.pluginId === plugin.manifest.id ? draft.value : null
const config = props.config ?? fromDraft?.config ?? plugin.buildConfig?.(roomCode) ?? plugin.defaultConfig
// Theme precedence mirrors config: a saved game's theme > the draft's theme
// (survives a host-tab reload via the persisted draft) > the global selection.
const themeId = props.themeId ?? fromDraft?.themeId ?? themeState.value
// Adopt it for the whole host shell (the global ThemeProvider reads this).
themeState.value = themeId
const meta: RoomMeta = {
  pluginId: plugin.manifest.id,
  pluginVersion: plugin.manifest.version,
  title: config.title || plugin.manifest.name,
  themeId,
}
// The roster, read lazily at derive/reveal time (it changes as players join).
const getPlayers = (): ScorePlayer[] =>
  room.players.value.map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex }))

room.host.loadGame({
  meta,
  config: config as unknown as RelayValue,
  publishConfig: redactGameConfig(plugin, config) as unknown as RelayValue,
  rounds: gameRounds(plugin, config),
  answerKeys: gameAnswerKeys(plugin, config) as unknown as Record<number, RelayValue>,
  // Two-phase wiring: derive a round's content from earlier inputs at runtime,
  // and publish a public reveal summary so phones can show personal feedback.
  deriveContent: buildDeriveContent(plugin, config, roomCode, getPlayers) as never,
  revealSummary: buildRevealSummary(
    plugin,
    config,
    getPlayers,
    (i) => room.runtimeContentFor(i),
    (i) => room.answerKeyFor(i),
  ) as never,
})

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
