<script setup lang="ts">
/** The signed-in user's saved (bookmarked) games — C12. Mirrors the "Your games"
 *  list, but driven by /api/me/bookmarks. Bookmarks are added from a game's
 *  detail page (/g/[id]). */
import { gameCatalog } from '@doot-games/games/catalog'
import { GameCover } from '@doot-games/ui'
import { computed } from 'vue'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  authorName: string | null
  authorHandle: string | null
  description: string | null
  coverImage: string | null
  createdAt: number
}

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
// 401 (anon) falls back to an empty list rather than throwing.
const { data } = await useFetch<{ games: SavedGameSummary[] }>('/api/me/bookmarks', {
  default: () => ({ games: [] }),
})
const games = computed(() => data.value?.games ?? [])
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Your library</span><h2>Saved games</h2></div>
          <NuxtLink to="/explore" class="btn btn-ghost btn-sm">Explore games</NuxtLink>
        </div>

        <div v-if="!loggedIn" class="empty">
          <p>
            <NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to save games and find them
            here. Hosting and playing never need an account.
          </p>
        </div>

        <template v-else>
          <div v-if="games.length" class="grid">
            <NuxtLink v-for="g in games" :key="g.id" :to="`/g/${g.id}`" class="card">
              <GameCover :title="g.title" :type="g.pluginId" :image="g.coverImage" />
              <div class="card-body">
                <div class="card-title">{{ g.title }}</div>
                <div class="card-meta">
                  <span class="badge type">{{ typeName(g.pluginId) }}</span>
                  <span v-if="g.authorHandle" class="badge">@{{ g.authorHandle }}</span>
                  <span v-else-if="g.authorName" class="badge">by {{ g.authorName }}</span>
                </div>
                <span class="card-cta">View &amp; host &rarr;</span>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="empty">
            You have not saved any games yet. Open a game and tap
            <strong>Save</strong>, or <NuxtLink to="/explore" class="explore-link">explore games</NuxtLink>
            to find some.
          </p>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.card-cta {
  display: inline-block;
  margin-top: 4px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.empty {
  color: var(--ink-soft);
  padding: 24px 0;
  line-height: 1.5;
}
.explore-link {
  color: var(--primary);
  font-weight: 700;
}
</style>
