<script setup lang="ts">
import { gameCatalog } from '@doot-games/games/catalog'
import { themeList } from '@doot-games/themes'
import { GameCover } from '@doot-games/ui'
import { computed, ref } from 'vue'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  createdAt: number
}
const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
const { data: pub } = await useFetch<{ games: SavedGameSummary[] }>('/api/games')
const { data: mineData } = await useFetch<{ games: SavedGameSummary[] }>('/api/games', {
  query: { scope: 'mine' },
  default: () => ({ games: [] }),
})
const publicGames = computed(() => pub.value?.games ?? [])
const myGames = computed(() => mineData.value?.games ?? [])
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id

/** A unified card model: saved games (link to /g/<id>) and built-in game types
 *  (templates, link to the editor) both render as cover cards. */
interface Card {
  key: string
  title: string
  type: string
  typeLabel: string
  theme: string | null
  to: string
  kind: 'game' | 'type'
}
const gameCard = (g: SavedGameSummary): Card => ({
  key: g.id,
  title: g.title,
  type: g.pluginId,
  typeLabel: typeName(g.pluginId),
  theme: g.themeId,
  to: `/g/${g.id}`,
  kind: 'game',
})
const templateCards = computed<Card[]>(() =>
  gameCatalog.map((c) => ({
    key: `t-${c.id}`,
    title: c.name,
    type: c.id,
    typeLabel: c.name,
    theme: null,
    to: `/editor/${c.id}`,
    kind: 'type',
  })),
)

// ---- filters -------------------------------------------------------------
const search = ref('')
const typeFilter = ref<string>('all')
const themeFilter = ref<string>('all')
const types = computed(() => gameCatalog.map((c) => ({ id: c.id, name: c.name })))

function matches(card: Card): boolean {
  if (typeFilter.value !== 'all' && card.type !== typeFilter.value) return false
  // Templates are theme-agnostic; hide them when a specific theme is selected.
  if (themeFilter.value !== 'all' && card.theme !== themeFilter.value) return false
  const q = search.value.trim().toLowerCase()
  if (q && !card.title.toLowerCase().includes(q) && !card.typeLabel.toLowerCase().includes(q)) return false
  return true
}
const myCards = computed(() => myGames.value.map(gameCard).filter(matches))
const discoverCards = computed(() =>
  [...publicGames.value.map(gameCard), ...templateCards.value].filter(matches),
)

// ---- featured ------------------------------------------------------------
// Showcase the newest public game if there is one, else the Quip Clash flagship.
const featured = computed(() => {
  const g = publicGames.value[0]
  if (g)
    return {
      title: g.title,
      type: g.pluginId,
      typeLabel: typeName(g.pluginId),
      blurb: 'Featured by the community. Put it on the big screen and pull a crowd in from their phones.',
      to: `/g/${g.id}`,
      cta: 'View & host',
    }
  return {
    title: 'Quip Clash',
    type: 'quip-clash',
    typeLabel: 'Quip Clash',
    blurb:
      'Answer a prompt, then vote for the funniest answer. The room writes the jokes, and a fresh set of prompts drops every game. A Game From Doot.',
    to: '/editor/quip-clash',
    cta: 'Open in editor',
  }
})
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Discover</span><h2>Explore games</h2></div>
        </div>

        <!-- toolbar: search + filter chips -->
        <div class="toolbar">
          <div class="searchrow">
            <div class="search">
              <svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              <input v-model="search" type="search" placeholder="Search games or topics" aria-label="Search games" />
            </div>
          </div>
          <div class="chips">
            <div class="chip-grp">
              <span class="filter-lbl">Type</span>
              <button class="chip" :class="{ on: typeFilter === 'all' }" @click="typeFilter = 'all'">All</button>
              <button v-for="t in types" :key="t.id" class="chip" :class="{ on: typeFilter === t.id }" @click="typeFilter = t.id">
                {{ t.name }}
              </button>
            </div>
            <div class="chip-grp">
              <span class="filter-lbl">Theme</span>
              <button class="chip" :class="{ on: themeFilter === 'all' }" @click="themeFilter = 'all'">All</button>
              <button v-for="t in themeList" :key="t.id" class="chip" :class="{ on: themeFilter === t.id }" @click="themeFilter = t.id">
                {{ t.name }}
              </button>
            </div>
          </div>
        </div>

        <!-- featured hero -->
        <NuxtLink :to="featured.to" class="feature">
          <div class="fcontent">
            <span class="fkick">Featured this week</span>
            <h2>{{ featured.title }}</h2>
            <p>{{ featured.blurb }}</p>
            <span class="btn btn-primary">{{ featured.cta }}</span>
          </div>
          <div class="fart">
            <GameCover :title="featured.title" :type="featured.type" :height="280" />
          </div>
        </NuxtLink>

        <!-- your games -->
        <template v-if="myCards.length">
          <div class="section-head sub"><div><span class="kicker">Yours</span><h3>Your games</h3></div></div>
          <div class="grid">
            <NuxtLink v-for="c in myCards" :key="c.key" :to="c.to" class="card">
              <GameCover :title="c.title" :type="c.type" />
              <div class="card-body">
                <div class="card-title">{{ c.title }}</div>
                <div class="card-meta">
                  <span class="badge type">{{ c.typeLabel }}</span>
                  <span v-if="c.theme" class="badge">{{ c.theme }}</span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </template>

        <!-- discovery grid (public games + game-type templates) -->
        <div class="section-head sub"><div><span class="kicker">Browse</span><h3>Games &amp; templates</h3></div></div>
        <p v-if="!loggedIn" class="explore-note">
          <NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to save games and find them here later. Hosting and playing never need an account.
        </p>
        <div class="grid">
          <NuxtLink v-for="c in discoverCards" :key="c.key" :to="c.to" class="card">
            <GameCover :title="c.title" :type="c.type" />
            <div class="card-body">
              <div class="card-title">{{ c.title }}</div>
              <div class="card-meta">
                <span class="badge type">{{ c.typeLabel }}</span>
                <span v-if="c.kind === 'type'" class="badge">Template</span>
                <span v-else-if="c.theme" class="badge">{{ c.theme }}</span>
              </div>
              <span class="card-cta">{{ c.kind === 'type' ? 'Open editor' : 'View & host' }} &rarr;</span>
            </div>
          </NuxtLink>
        </div>
        <p v-if="!discoverCards.length" class="empty">No games match those filters yet.</p>
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
.searchrow {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.search {
  flex: 1;
  min-width: 240px;
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
  margin-bottom: 30px;
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
.section-head.sub {
  margin: 8px 0 16px;
}
.section-head.sub h3 {
  font-size: 22px;
  font-weight: 800;
}
.card-cta {
  display: inline-block;
  margin-top: 4px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.explore-note {
  color: var(--ink-soft);
  font-size: 14px;
  margin: -6px 0 16px;
}
.explore-link {
  color: var(--primary);
  font-weight: 700;
}
.empty {
  color: var(--ink-soft);
  padding: 20px 0;
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
