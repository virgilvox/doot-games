<script setup lang="ts">
import { gameCatalog } from '@doot-games/games/catalog'
import { GameCover } from '@doot-games/ui'
import { computed, ref } from 'vue'

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  coverImage: string | null
  createdAt: number
}
const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
// Owner-scoped: returns the caller's games at any visibility (401 -> [] when anon).
const { data } = await useFetch<{ games: SavedGameSummary[] }>('/api/games', {
  query: { scope: 'mine' },
  default: () => ({ games: [] }),
})
const games = computed(() => data.value?.games ?? [])
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id

const visLabel = { private: 'Private', unlisted: 'Unlisted', public: 'Public' } as const
const filter = ref<'all' | 'private' | 'unlisted' | 'public'>('all')
const counts = computed(() => {
  const c = { all: games.value.length, private: 0, unlisted: 0, public: 0 }
  for (const g of games.value) c[g.visibility]++
  return c
})
const filtered = computed(() =>
  filter.value === 'all' ? games.value : games.value.filter((g) => g.visibility === filter.value),
)
const filters = ['all', 'private', 'unlisted', 'public'] as const

// Change a game's visibility (owner-only PATCH), so sharing can be edited without
// opening the editor. Optimistic, with revert on failure. We reassign data.value
// immutably rather than mutating the item in place: useFetch's data ref does not
// reliably track a nested property mutation, so counts + the select must rebind off
// a fresh array.
function applyVisibility(id: string, visibility: SavedGameSummary['visibility']) {
  if (!data.value) return
  data.value = { games: data.value.games.map((x) => (x.id === id ? { ...x, visibility } : x)) }
}
async function setVisibility(g: SavedGameSummary, e: Event) {
  const val = (e.target as HTMLSelectElement).value as SavedGameSummary['visibility']
  if (val === g.visibility) return
  const prev = g.visibility
  applyVisibility(g.id, val)
  try {
    await $fetch(`/api/games/${g.id}`, { method: 'PATCH', body: { visibility: val } })
  } catch {
    applyVisibility(g.id, prev)
  }
}
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Your library</span><h2>Your games</h2></div>
          <NuxtLink to="/create" class="btn btn-primary btn-sm">+ New game</NuxtLink>
        </div>

        <div v-if="!loggedIn" class="empty">
          <p><NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to save games and find them here. Hosting and playing never need an account.</p>
        </div>

        <template v-else>
          <div class="chips">
            <button v-for="f in filters" :key="f" class="chip" :class="{ on: filter === f }" @click="filter = f">
              {{ f === 'all' ? 'All' : visLabel[f] }} <span class="n mono">{{ counts[f] }}</span>
            </button>
          </div>

          <div v-if="filtered.length" class="grid">
            <!-- Stretched-link card: the card body is a plain container with one
                 full-bleed link to /g/<id>, so the inline visibility <select> can sit
                 ABOVE it without nesting an interactive control inside an anchor. -->
            <div v-for="g in filtered" :key="g.id" class="card card-link">
              <NuxtLink :to="`/g/${g.id}`" class="card-stretch" :aria-label="`Manage ${g.title}`" />
              <GameCover :title="g.title" :type="g.pluginId" :image="g.coverImage" />
              <div class="card-body">
                <div class="card-title">{{ g.title }}</div>
                <div class="card-meta">
                  <span class="badge type">{{ typeName(g.pluginId) }}</span>
                  <select
                    class="vis-edit"
                    :class="`vis-${g.visibility}`"
                    :value="g.visibility"
                    aria-label="Change who can see this game"
                    @change="setVisibility(g, $event)"
                  >
                    <option value="private">Private</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="public">Public</option>
                  </select>
                </div>
                <span class="card-cta">Manage &amp; host &rarr;</span>
              </div>
            </div>
          </div>
          <p v-else class="empty">
            <template v-if="counts.all === 0">You have not saved any games yet. <NuxtLink to="/create" class="explore-link">Build your first one</NuxtLink>.</template>
            <template v-else>No {{ filter }} games.</template>
          </p>
        </template>
      </section>
    </div>
  </main>
</template>

<style scoped>
.chips {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  margin-bottom: 22px;
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
.chip .n {
  opacity: 0.7;
  margin-left: 3px;
}
.card-cta {
  display: inline-block;
  margin-top: 4px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.badge.vis-public {
  border-color: var(--c5);
  color: var(--c5);
}
/* Inline visibility editor on each card. Styled like a small chip; @click.stop keeps
   it from following the card link. */
.vis-edit {
  /* Sits above the full-bleed card-stretch link so it stays interactive. */
  position: relative;
  z-index: 2;
  font: 700 12px/1 inherit;
  padding: 4px 8px;
  border-radius: 999px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink-soft);
  cursor: pointer;
}
.vis-edit.vis-public {
  border-color: var(--c5);
  color: var(--c5);
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
