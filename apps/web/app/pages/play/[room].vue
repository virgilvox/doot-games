<script setup lang="ts">
import { RoomRuntime, addr, createClaspRelay } from '@doot-games/engine'
import { DootLogo, JoinForm } from '@doot-games/ui'
import { ref } from 'vue'

const route = useRoute()
const runtime = useRuntimeConfig()
const roomCode = computed(() => String(route.params.room).toUpperCase())
const name = ref('')
const joined = ref(false)
const watching = ref(false)

// Remember the player's name so a refresh (e.g. after a reconnect) prefills the
// field instead of making them retype it. A display name is the player's
// identity across rooms, so key it globally. Storage is a convenience only:
// identity is still derived from room + name, and every access fails open so the
// play surface keeps working where storage is blocked (embeds) or on the server.
const NAME_KEY = 'doot:player-name'
function readSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function saveName(n: string): void {
  try {
    localStorage.setItem(NAME_KEY, n)
  } catch {
    /* storage blocked: ignore */
  }
}
const savedName = ref(readSavedName())

function onJoin(payload: { code: string; name: string }) {
  name.value = payload.name
  saveName(payload.name)
  joined.value = true
}

// "Just watch": join as audience (display-only, never counts toward the cap).
function onWatch() {
  watching.value = true
}

// Pre-join checks, bounded and fail-open (a slow or dead relay must never stop
// someone joining): (1) is this name already live in the room? Identity is
// derived from room + name, so two phones under one name collide onto a single
// identity, so we warn the second person. (2) Is the room at the host's player
// cap? If so, turn a NEW player away (a reconnecting name still gets in).
async function probeName(
  code: string,
  playerName: string,
): Promise<{ present: boolean; full: boolean }> {
  const fallback = { present: false, full: false }
  let relay: ReturnType<typeof createClaspRelay> | null = null
  try {
    relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-probe' })
    const r = relay
    const check = (async () => {
      await r.connect()
      // Read the cap and the name-collision status together. Bound the meta read
      // so a dead room (no meta) doesn't hang the gate.
      const [meta, presence] = await Promise.all([
        Promise.race([
          r.get(addr.meta(code)).catch(() => undefined),
          new Promise<undefined>((res) => setTimeout(() => res(undefined), 700)),
        ]),
        RoomRuntime.probePresence(r, code, playerName, Date.now),
      ])
      const cap = (meta as { playerCap?: number | null } | undefined)?.playerCap ?? 0
      // Only count the roster when there's a cap to enforce (keeps uncapped joins snappy).
      const count = cap > 0 ? await RoomRuntime.probeLiveCount(r, code, Date.now) : 0
      const full = cap > 0 && count >= cap && !presence.present
      return { present: presence.present, full }
    })().catch(() => fallback)
    const timeout = new Promise<{ present: boolean; full: boolean }>((resolve) =>
      setTimeout(() => resolve(fallback), 3000),
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
      <AudienceRoom v-if="watching" :room="roomCode" />
      <PlayerRoom v-else-if="joined" :room="roomCode" :name="name" />
      <div v-else class="gate">
        <div class="panel card">
          <DootLogo :size="48" />
          <p class="lead">Joining room <b class="mono">{{ roomCode }}</b></p>
          <JoinForm :initial-code="roomCode" :initial-name="savedName" :probe="probeName" @join="onJoin" @watch="onWatch" />
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
