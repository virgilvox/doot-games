<script setup lang="ts">
/**
 * Joins a room from a phone. Client-only: it connects as a player, waits for
 * the host's published meta to learn which plugin is running, then provides the
 * room to that plugin's Player view and renders it.
 */
import { createClaspRelay } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import { GamePlayer, getPlugin } from '@doot-games/games'
import { Avatar, PhoneShell } from '@doot-games/ui'
import { computed, watch } from 'vue'

const props = defineProps<{ room: string; name: string }>()
const runtime = useRuntimeConfig()

const relay = createClaspRelay(runtime.public.relayUrl as string, { name: `doot-player:${props.name}` })
const room = useDootRoom({ relay, room: props.room, role: 'player', name: props.name })
provideDootRoom(room)

// Adopt the host's per-game theme once meta arrives; the app's global
// ThemeProvider (driven by this state) then restyles the play surface.
const activeTheme = useState<string>('doot-theme', () => 'doot')
watch(
  () => room.theme.value,
  (t) => {
    if (t) activeTheme.value = t
  },
)

const code = props.room
const plugin = computed(() => {
  const id = room.meta.value?.pluginId
  return id ? getPlugin(id) : undefined
})
const PlayerView = computed(() => plugin.value?.components?.Player ?? GamePlayer)
</script>

<template>
  <PhoneShell>
    <template #banner>
      <div v-if="room.reconnecting.value" class="banner recon">
        Reconnecting… your answers are safe.
      </div>
      <div v-else-if="room.error.value" class="banner err">{{ room.error.value }}</div>
    </template>
    <template #top>
      <span class="who"><Avatar :name="name" :id="room.me.value.id" :size="34" /> {{ name }}</span>
      <span class="conn mono" :class="{ live: room.connected.value }">
        {{ room.connected.value ? 'live' : '…' }}
      </span>
    </template>
    <component :is="PlayerView" v-if="plugin" :plugin="plugin" />
    <div v-else class="loading">Joining room {{ code }}…</div>
  </PhoneShell>
</template>

<style scoped>
.who {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 800;
}
.conn {
  font-size: 12px;
  color: var(--mute);
}
.conn.live {
  color: var(--c5);
}
.loading {
  text-align: center;
  color: var(--ink-soft);
  padding: 40px 0;
}
.banner {
  margin: -22px -22px 0;
  padding: 10px 16px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
  border-bottom: var(--bd) solid var(--line);
}
.banner.recon {
  background: var(--c1);
  color: var(--ink);
}
.banner.err {
  background: var(--primary);
  color: var(--primary-ink);
}
</style>
