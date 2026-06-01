<script setup lang="ts">
import { flagshipGames, gameCatalog } from '@doot-games/games/catalog'
import { themeList } from '@doot-games/themes'
import { GameCover } from '@doot-games/ui'
import { computed, ref } from 'vue'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  authorName: string | null
  authorHandle: string | null
  createdAt: number
}
const { data: pub } = await useFetch<{ games: SavedGameSummary[] }>('/api/games')
const publicGames = computed(() => pub.value?.games ?? [])
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id

// ---- filters -------------------------------------------------------------
const search = ref('')
const typeFilter = ref<string>('all')
const themeFilter = ref<string>('all')
const types = computed(() => gameCatalog.map((c) => ({ id: c.id, name: c.name })))

const q = computed(() => search.value.trim().toLowerCase())
function textMatch(title: string, type: string) {
  return !q.value || title.toLowerCase().includes(q.value) || typeName(type).toLowerCase().includes(q.value)
}

// "Games From Doot": ready-to-play flagships, hosted directly. Listed
// alphabetically by name for a predictable, scannable grid.
const doot = computed(() =>
  flagshipGames
    .filter((g) => typeFilter.value === 'all' || g.id === typeFilter.value)
    .filter((g) => themeFilter.value === 'all') // flagships are theme-agnostic
    .filter((g) => textMatch(g.name, g.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name)),
)
// Community: public games published by others.
const community = computed(() =>
  publicGames.value
    .filter((g) => typeFilter.value === 'all' || g.pluginId === typeFilter.value)
    .filter((g) => themeFilter.value === 'all' || g.themeId === themeFilter.value)
    .filter((g) => textMatch(g.title, g.pluginId)),
)

const featured = computed(() => flagshipGames[0] ?? null)
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Discover</span><h2>Explore games</h2></div>
        </div>

        <div class="toolbar">
          <div class="search">
            <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
            <input v-model="search" type="search" placeholder="Search games or topics" aria-label="Search games" />
          </div>
          <div class="chips">
            <div class="chip-grp">
              <span class="filter-lbl">Type</span>
              <button class="chip" :class="{ on: typeFilter === 'all' }" @click="typeFilter = 'all'">All</button>
              <button v-for="t in types" :key="t.id" class="chip" :class="{ on: typeFilter === t.id }" @click="typeFilter = t.id">{{ t.name }}</button>
            </div>
            <div class="chip-grp">
              <span class="filter-lbl">Theme</span>
              <button class="chip" :class="{ on: themeFilter === 'all' }" @click="themeFilter = 'all'">All</button>
              <button v-for="t in themeList" :key="t.id" class="chip" :class="{ on: themeFilter === t.id }" @click="themeFilter = t.id">{{ t.name }}</button>
            </div>
          </div>
        </div>

        <!-- featured Game From Doot -->
        <NuxtLink v-if="featured" :to="`/host/${featured.id}`" class="feature">
          <div class="fcontent">
            <span class="fkick">Featured · Game From Doot</span>
            <h2>{{ featured.name }}</h2>
            <p>{{ featured.description }}</p>
            <span class="btn btn-primary">Host now</span>
          </div>
          <div class="fart"><GameCover :title="featured.name" :type="featured.id" :height="280" /></div>
        </NuxtLink>
      </section>

      <!-- Games From Doot: ready to play -->
      <section v-if="doot.length" class="section">
        <div class="section-head"><div><span class="kicker">Ready to play</span><h2>Games From Doot</h2></div></div>
        <div class="grid">
          <NuxtLink v-for="g in doot" :key="g.id" :to="`/host/${g.id}`" class="card">
            <GameCover :title="g.name" :type="g.id" />
            <div class="card-body">
              <div class="card-title">{{ g.name }}</div>
              <p class="card-desc">{{ g.description }}</p>
              <span class="card-cta">Host now &rarr;</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- Community: public games -->
      <section class="section">
        <div class="section-head"><div><span class="kicker">From the community</span><h2>Public games</h2></div></div>
        <div v-if="community.length" class="grid">
          <div v-for="g in community" :key="g.id" class="card card-link">
            <NuxtLink :to="`/g/${g.id}`" class="card-stretch" :aria-label="`${g.title}, view and host`" />
            <GameCover :title="g.title" :type="g.pluginId" />
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ typeName(g.pluginId) }}</span>
                <span class="badge">{{ g.themeId }}</span>
              </div>
              <NuxtLink v-if="g.authorHandle" :to="`/u/@${g.authorHandle}`" class="card-by card-by-link">by {{ g.authorName }}</NuxtLink>
              <p v-else-if="g.authorName" class="card-by">by {{ g.authorName }}</p>
              <span class="card-cta">View &amp; host &rarr;</span>
            </div>
          </div>
        </div>
        <p v-else class="empty">
          No public games yet. <NuxtLink to="/create" class="explore-link">Build one</NuxtLink> and set it public to see it here.
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 26px;
}
.search {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 13px 20px;
  box-shadow: var(--shadow-sm);
}
.search input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 16px;
  font-weight: 600;
  width: 100%;
  color: var(--ink);
  font-family: inherit;
}
.search input::placeholder {
  color: var(--mute);
}
.search .ic {
  flex: none;
  width: 20px;
  height: 20px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  color: var(--ink-soft);
}
.chips {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  align-items: center;
}
.chip-grp {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  align-items: center;
  padding-right: 10px;
  border-right: 2px solid var(--line-soft);
}
.chip-grp:last-child {
  border-right: none;
}
.filter-lbl {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
}
.chip {
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  border-radius: 999px;
  padding: 8px 15px;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-soft);
  cursor: pointer;
  transition: all 0.12s;
  font-family: inherit;
}
.chip:hover {
  border-color: var(--line);
  color: var(--ink);
}
.chip.on {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--line);
}
.feature {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow);
  text-decoration: none;
  color: inherit;
  transition: transform 0.12s, box-shadow 0.12s;
}
.feature:hover {
  transform: translate(-2px, -3px);
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--primary) 30%, transparent);
}
.fcontent {
  padding: 34px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.fkick {
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--primary);
  font-weight: 500;
}
.fcontent h2 {
  font-size: clamp(28px, 4vw, 38px);
  font-weight: 800;
  margin: 10px 0 12px;
  letter-spacing: -0.02em;
}
.fcontent p {
  font-size: 16px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin-bottom: 20px;
  max-width: 42ch;
}
.fart {
  position: relative;
  min-height: 240px;
}
.fart :deep(.cover) {
  height: 100% !important;
  border-bottom: none;
  border-left: var(--bd) solid var(--line);
}
.card-desc {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-by {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
}
.card-cta {
  display: inline-block;
  margin-top: 4px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.explore-link {
  color: var(--primary);
  font-weight: 700;
}
.empty {
  color: var(--ink-soft);
  padding: 16px 0 28px;
}
@media (max-width: 860px) {
  .feature {
    grid-template-columns: 1fr;
  }
  .fart {
    min-height: 160px;
    order: -1;
  }
  .fart :deep(.cover) {
    border-left: none;
    border-bottom: var(--bd) solid var(--line);
  }
}
</style>
