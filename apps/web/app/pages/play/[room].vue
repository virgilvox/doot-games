<script setup lang="ts">
import { RoomRuntime, createClaspRelay } from '@doot-games/engine'
import { DootLogo, JoinForm } from '@doot-games/ui'
import { ref } from 'vue'

const route = useRoute()
const runtime = useRuntimeConfig()
const roomCode = computed(() => String(route.params.room).toUpperCase())
const name = ref('')
const joined = ref(false)

function onJoin(payload: { code: string; name: string }) {
  name.value = payload.name
  joined.value = true
}

// Pre-join check: is this name already live in the room? Identity is derived from
// room + name, so two phones under one name collide onto a single identity. We
// warn the second person (the JoinForm offers "pick another" or "reconnect").
// Bounded and fail-open: a slow or dead relay must never stop someone joining.
async function probeName(code: string, playerName: string): Promise<{ present: boolean }> {
  const fallback = { present: false }
  let relay: ReturnType<typeof createClaspRelay> | null = null
  try {
    relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-probe' })
    const r = relay
    const check = (async () => {
      await r.connect()
      const res = await RoomRuntime.probePresence(r, code, playerName, Date.now)
      return { present: res.present }
    })().catch(() => fallback)
    const timeout = new Promise<{ present: boolean }>((resolve) =>
      setTimeout(() => resolve(fallback), 2500),
    )
    return await Promise.race([check, timeout])
  } catch {
    return fallback
  } finally {
    try {
      relay?.close()
    } catch {
      /* ignore */
    }
  }
}
</script>

<template>
  <main class="play">
    <ClientOnly>
      <PlayerRoom v-if="joined" :room="roomCode" :name="name" />
      <div v-else class="gate">
        <div class="panel card">
          <DootLogo :size="48" />
          <p class="lead">Joining room <b class="mono">{{ roomCode }}</b></p>
          <JoinForm :initial-code="roomCode" :probe="probeName" @join="onJoin" />
        </div>
      </div>
      <template #fallback><div class="gate">Loading…</div></template>
    </ClientOnly>
  </main>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
.card {
  max-width: 420px;
  width: 100%;
  padding: 30px;
  text-align: center;
}
.lead {
  color: var(--ink-soft);
  margin: 14px 0 18px;
}
</style>
