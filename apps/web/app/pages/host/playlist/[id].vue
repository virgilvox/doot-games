<script setup lang="ts">
// Hosts a SAVED session lineup (playlist). Fetches its ordered game ids, then runs
// them through the same SessionHostRoom (skipping the picker).
const route = useRoute()
const id = computed(() => String(route.params.id))
const { data: playlist, error } = await useFetch<{ name: string; games: string[] }>(() => `/api/playlists/${id.value}`)
useDootSeo({ title: playlist.value?.name ?? 'Host a session' })
</script>

<template>
  <ClientOnly>
    <SessionHostRoom v-if="playlist?.games?.length" :game-ids="playlist.games" />
    <div v-else class="boot">
      <template v-if="error">
        <h2>Lineup not found</h2>
        <p>This session lineup is private or no longer exists.</p>
        <NuxtLink to="/host/session" class="btn btn-primary">Build a session</NuxtLink>
      </template>
      <template v-else>Setting up the session…</template>
    </div>
    <template #fallback><div class="boot">Setting up the session…</div></template>
  </ClientOnly>
</template>

<style scoped>
.boot {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; min-height: 100vh; text-align: center; color: var(--ink-soft); padding: 24px;
}
.boot h2 { font-size: 26px; font-weight: 800; color: var(--ink); }
.boot .btn { margin-top: 8px; }
</style>
