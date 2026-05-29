<script setup lang="ts">
import { DootLogo, JoinForm } from '@doot-games/ui'
import { ref } from 'vue'

const route = useRoute()
const roomCode = computed(() => String(route.params.room).toUpperCase())
const name = ref('')
const joined = ref(false)

function onJoin(payload: { code: string; name: string }) {
  name.value = payload.name
  joined.value = true
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
          <JoinForm :initial-code="roomCode" @join="onJoin" />
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
