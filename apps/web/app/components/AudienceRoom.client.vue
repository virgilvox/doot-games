<script setup lang="ts">
/**
 * Watches a room from a phone as audience (P4). Client-only: it connects as an
 * `audience` role (display-only, never submits, never counts toward the player cap),
 * waits for the host's meta to learn the plugin, then renders the read-only
 * spectator view. No name needed, you're just watching.
 */
import { createClaspRelay } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import { GameAudience, getPlugin } from '@doot-games/games'
import { DootLogo, PhoneShell } from '@doot-games/ui'
import { computed, onScopeDispose, ref, watch } from 'vue'

const props = defineProps<{ room: string }>()
const runtime = useRuntimeConfig()

const relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-audience' })
const room = useDootRoom({ relay, room: props.room, role: 'audience' })
provideDootRoom(room)

// Adopt the host's per-game theme once meta arrives (same as a player).
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
const hostGone = computed(() => room.ready.value && !room.hostPresent.value)

const notFound = ref(false)
const timer = setTimeout(() => {
  if (!room.meta.value) notFound.value = true
}, 8000)
watch(
  () => room.meta.value,
  (m) => {
    if (m) {
      notFound.value = false
      clearTimeout(timer)
    }
  },
)
onScopeDispose(() => clearTimeout(timer))
</script>

<template>
  <PhoneShell>
    <template #banner>
      <div v-if="room.reconnecting.value" class="banner recon">Reconnecting…</div>
      <div v-else-if="hostGone" class="banner recon">
        The host's screen went away. Waiting for them to come back…
      </div>
      <div v-else-if="room.error.value" class="banner err">{{ room.error.value }}</div>
    </template>
    <template #top>
      <span class="who"><DootLogo :size="26" /> <span class="who-name">Watching</span></span>
      <span class="conn mono" :class="{ live: room.connected.value }">
        {{ room.connected.value ? 'live' : '…' }}
      </span>
    </template>
    <GameAudience v-if="plugin" :plugin="plugin" />
    <div v-else-if="notFound" class="loading deadroom">
      <h2>Can't find room {{ code }}</h2>
      <p>Double-check the code with the host, or the room may have ended.</p>
      <NuxtLink to="/" class="btn btn-primary">Back to start</NuxtLink>
    </div>
    <div v-else class="loading">Joining room {{ code }}…</div>
  </PhoneShell>
</template>

<style scoped>
.who {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 800;
  min-width: 0;
}
.who-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.deadroom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.deadroom h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--ink);
}
.deadroom p {
  max-width: 30ch;
  line-height: 1.45;
}
.deadroom .btn {
  margin-top: 8px;
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
