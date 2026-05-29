<script setup lang="ts">
import { gameCatalog } from '@doot-games/games/catalog'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  createdAt: number
}
const { loggedIn } = useUserSession()
const { data: pub } = await useFetch<{ games: SavedGameSummary[] }>('/api/games')
const { data: mineData } = await useFetch<{ games: SavedGameSummary[] }>('/api/games', {
  query: { scope: 'mine' },
  immediate: loggedIn.value,
  default: () => ({ games: [] }),
})
const publicGames = computed(() => pub.value?.games ?? [])
const myGames = computed(() => (loggedIn.value ? (mineData.value?.games ?? []) : []))
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id
const visLabel = { private: 'Private', unlisted: 'Unlisted', public: 'Public' } as const
</script>

<template>
  <main>
    <div class="wrap">
      <section v-if="myGames.length" class="section" style="padding-top: 34px">
        <div class="section-head">
          <div><span class="kicker">Yours</span><h2>My games</h2></div>
        </div>
        <div class="grid">
          <NuxtLink v-for="g in myGames" :key="g.id" :to="`/g/${g.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ typeName(g.pluginId) }}</span>
                <span class="badge">{{ visLabel[g.visibility] }}</span>
              </div>
              <span class="btn btn-primary btn-sm">View &amp; host</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section v-if="publicGames.length" class="section" :style="myGames.length ? '' : 'padding-top: 34px'">
        <div class="section-head">
          <div><span class="kicker">Discover</span><h2>Public games</h2></div>
        </div>
        <div class="grid">
          <NuxtLink v-for="g in publicGames" :key="g.id" :to="`/g/${g.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ typeName(g.pluginId) }}</span>
                <span class="badge">{{ g.themeId }}</span>
              </div>
              <span class="btn btn-primary btn-sm">View &amp; host</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="section" :style="myGames.length || publicGames.length ? '' : 'padding-top: 34px'">
        <div class="section-head">
          <div><span class="kicker">Build</span><h2>Start a new game</h2></div>
        </div>
        <p v-if="!loggedIn" class="explore-note">
          <NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to save your games and find them here later — hosting and playing never need an account.
        </p>
        <div class="grid">
          <NuxtLink v-for="c in gameCatalog" :key="c.id" :to="`/editor/${c.id}`" class="card">
            <div class="card-body">
              <div class="card-title">{{ c.name }}</div>
              <p style="color: var(--ink-soft); font-size: 14px; line-height: 1.5; min-height: 44px">
                {{ c.description }}
              </p>
              <span class="btn btn-ghost btn-sm">Open editor</span>
            </div>
          </NuxtLink>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.explore-note {
  color: var(--ink-soft);
  font-size: 14px;
  margin: -6px 0 16px;
}
.explore-link {
  color: var(--primary);
  font-weight: 700;
}
</style>
