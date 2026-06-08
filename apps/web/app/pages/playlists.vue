<script setup lang="ts">
// Browse + manage your saved session lineups (playlists). A lineup is created from
// the session builder (/host/session -> "Save lineup"); here you host or delete them.
useDootSeo({ title: 'Session lineups', description: 'Save a night of Doot games and host it any time.' })

interface PlaylistSummary {
  id: string
  name: string
  description: string | null
  games: string[]
  gameCount: number
  visibility: string
}
const { data, refresh } = await useFetch<{ playlists: PlaylistSummary[] }>('/api/playlists?scope=mine')
const mine = computed(() => data.value?.playlists ?? [])

async function remove(id: string) {
  await $fetch(`/api/playlists/${id}`, { method: 'DELETE' }).catch(() => {})
  await refresh()
}
</script>

<template>
  <main class="wrap pls">
    <header class="pls-head">
      <div>
        <h1>Session lineups</h1>
        <p class="lead">Save a night of games and host it back to back in one room.</p>
      </div>
      <NuxtLink to="/host/session" class="btn btn-primary">Build a session</NuxtLink>
    </header>

    <ul v-if="mine.length" class="pls-list">
      <li v-for="p in mine" :key="p.id" class="pls-card panel">
        <div class="pls-info">
          <h3>{{ p.name }}</h3>
          <p class="pls-meta">{{ p.gameCount }} {{ p.gameCount === 1 ? 'game' : 'games' }} · {{ p.visibility }}</p>
          <p class="pls-games">{{ p.games.join(' · ') }}</p>
        </div>
        <div class="pls-actions">
          <a :href="`/host/playlist/${p.id}`" class="btn btn-primary">Host</a>
          <button type="button" class="btn btn-ghost" @click="remove(p.id)">Delete</button>
        </div>
      </li>
    </ul>
    <div v-else class="pls-empty panel">
      <p>You haven't saved any lineups yet.</p>
      <NuxtLink to="/host/session" class="btn btn-primary">Build your first session</NuxtLink>
    </div>
  </main>
</template>

<style scoped>
.pls { padding: 28px 0 60px; }
.pls-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 22px; }
.pls-head h1 { font-size: clamp(28px, 5vw, 40px); font-weight: 800; }
.lead { color: var(--ink-soft); margin-top: 4px; }
.pls-list { list-style: none; display: grid; gap: 14px; }
.pls-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding: 18px 20px; }
.pls-info { min-width: 0; }
.pls-card h3 { font-size: 20px; font-weight: 800; }
.pls-meta { color: var(--ink-soft); font-size: 13px; font-weight: 700; text-transform: capitalize; margin-top: 2px; }
.pls-games { color: var(--mute); font-size: 13px; margin-top: 6px; overflow-wrap: anywhere; }
.pls-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.pls-empty { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 40px; text-align: center; }
</style>
