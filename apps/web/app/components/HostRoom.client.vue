<script setup lang="ts">
/**
 * Hosts a game on the big screen. Client-only (it opens a CLASP connection):
 * it creates a room, loads the plugin's default game (publishing a redacted
 * config), provides the room to the plugin's Host view, and renders it.
 */
import { type RelayValue, type RoomMeta, createClaspRelay, makeRoomCode } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import { getPlugin } from '@doot-games/games'
import { roundTimings } from '@doot-games/sdk'
import { DootLogo, Stage } from '@doot-games/ui'
import { computed } from 'vue'

const props = defineProps<{ pluginId: string }>()
const runtime = useRuntimeConfig()

const plugin = getPlugin(props.pluginId)
if (!plugin) throw createError({ statusCode: 404, statusMessage: `Unknown game type: ${props.pluginId}` })

const roomCode = makeRoomCode()
const relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-host' })
const room = useDootRoom({ relay, room: roomCode, role: 'host' })
provideDootRoom(room)

const cfg = plugin.defaultConfig
const meta: RoomMeta = {
  pluginId: plugin.manifest.id,
  pluginVersion: plugin.manifest.version,
  title: plugin.manifest.name,
  themeId: 'doot',
}
room.host.loadGame({
  meta,
  config: cfg as RelayValue,
  publishConfig: (plugin.redactConfig ? plugin.redactConfig(cfg) : cfg) as RelayValue,
  rounds: roundTimings(plugin.rounds(cfg)),
  answerKeys: (plugin.answerKeys ? plugin.answerKeys(cfg) : {}) as unknown as Record<
    number,
    RelayValue
  >,
})

const HostView = plugin.components.Host
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
    <component :is="HostView" />
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
