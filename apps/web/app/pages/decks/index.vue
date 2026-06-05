<script setup lang="ts">
/** The deck library: an official "Decks by Doot" section (filterable by game), plus your
 *  decks and the community's. A deck is reusable content (a table of rows) that games bind
 *  to or copy in. */
import { gameCatalog } from '@doot-games/games/catalog'
import { computed, ref } from 'vue'

interface DeckSummary {
  id: string
  name: string
  description: string | null
  kind: 'generic' | 'quiz' | 'prompt' | 'card'
  game: string | null
  visibility: 'private' | 'unlisted' | 'public'
  remixable: boolean
  columnCount: number
  rowCount: number
  authorName: string | null
  authorHandle: string | null
  createdAt: number
}

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
const tab = ref<'mine' | 'community'>(loggedIn.value ? 'mine' : 'community')

const { data: mineData } = await useFetch<{ decks: DeckSummary[] }>('/api/decks', {
  query: { scope: 'mine' },
  default: () => ({ decks: [] }),
})
const { data: publicData } = await useFetch<{ decks: DeckSummary[] }>('/api/decks', {
  default: () => ({ decks: [] }),
})

const kindLabel = { generic: 'Generic', quiz: 'Quiz', prompt: 'Prompt', card: 'Card' } as const
const visLabel = { private: 'Private', unlisted: 'Unlisted', public: 'Public' } as const

// The catalog gives a game id its display name (and a stable display order for the chips).
const gameOrder = gameCatalog.map((g) => g.id)
const gameName = (id: string | null) => (id ? (gameCatalog.find((g) => g.id === id)?.name ?? id) : null)

// "Decks by Doot": the official, public decks authored by the Doot account. Filterable by
// the game each is built for.
const official = computed(() => (publicData.value?.decks ?? []).filter((d) => d.authorName === 'Doot'))
const community = computed(() => (publicData.value?.decks ?? []).filter((d) => d.authorName !== 'Doot'))

const gameFilter = ref<string>('') // '' = all games
const officialGames = computed(() => {
  const counts = new Map<string, number>()
  for (const d of official.value) if (d.game) counts.set(d.game, (counts.get(d.game) ?? 0) + 1)
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: gameName(id) ?? id, count }))
    .sort((a, b) => gameOrder.indexOf(a.id) - gameOrder.indexOf(b.id))
})
const officialShown = computed(() => (gameFilter.value ? official.value.filter((d) => d.game === gameFilter.value) : official.value))

const browseDecks = computed(() => (tab.value === 'mine' ? (mineData.value?.decks ?? []) : community.value))
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div>
            <span class="kicker">Content library</span>
            <h2>Decks</h2>
          </div>
          <NuxtLink v-if="loggedIn" to="/decks/new" class="btn btn-primary btn-sm">+ New deck</NuxtLink>
        </div>

        <p class="lede">
          A deck is a table of rows (questions, prompts, images) that games pull from. Remix an official
          deck into a compatible game, or build your own and link it live so edits follow.
        </p>

        <!-- Decks by Doot: the official decks, filterable by game. -->
        <div v-if="official.length" class="doot">
          <div class="doot-head">
            <h3>Decks by Doot</h3>
            <span class="doot-sub">Official, remixable into any compatible game.</span>
          </div>
          <div class="chips" v-if="officialGames.length">
            <button class="chip" :class="{ on: gameFilter === '' }" @click="gameFilter = ''">All <span class="n mono">{{ official.length }}</span></button>
            <button v-for="g in officialGames" :key="g.id" class="chip" :class="{ on: gameFilter === g.id }" @click="gameFilter = g.id">
              {{ g.name }} <span class="n mono">{{ g.count }}</span>
            </button>
          </div>
          <div class="grid">
            <NuxtLink v-for="d in officialShown" :key="d.id" :to="`/decks/${d.id}`" class="card deck-card">
              <div class="deck-body">
                <div class="deck-top">
                  <span class="badge type">{{ kindLabel[d.kind] }}</span>
                  <span v-if="gameName(d.game)" class="badge game">{{ gameName(d.game) }}</span>
                </div>
                <div class="card-title">{{ d.name }}</div>
                <p v-if="d.description" class="deck-desc">{{ d.description }}</p>
                <div class="deck-meta mono">{{ d.rowCount }} row{{ d.rowCount === 1 ? '' : 's' }} · {{ d.columnCount }} col{{ d.columnCount === 1 ? '' : 's' }}</div>
                <span class="card-cta">View deck →</span>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Your decks + the community's. -->
        <div class="browse-head"><h3>Browse</h3></div>
        <div class="chips">
          <button class="chip" :class="{ on: tab === 'mine' }" :disabled="!loggedIn" @click="tab = 'mine'">My decks <span class="n mono">{{ mineData?.decks.length ?? 0 }}</span></button>
          <button class="chip" :class="{ on: tab === 'community' }" @click="tab = 'community'">Community <span class="n mono">{{ community.length }}</span></button>
        </div>

        <div v-if="!loggedIn && tab === 'mine'" class="empty">
          <p><NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to build and save decks.</p>
        </div>

        <div v-else-if="browseDecks.length" class="grid">
          <NuxtLink v-for="d in browseDecks" :key="d.id" :to="tab === 'mine' ? `/decks/${d.id}/edit` : `/decks/${d.id}`" class="card deck-card">
            <div class="deck-body">
              <div class="deck-top">
                <span class="badge type">{{ kindLabel[d.kind] }}</span>
                <span v-if="gameName(d.game)" class="badge game">{{ gameName(d.game) }}</span>
                <span v-if="tab === 'mine'" class="badge" :class="`vis-${d.visibility}`">{{ visLabel[d.visibility] }}</span>
              </div>
              <div class="card-title">{{ d.name }}</div>
              <p v-if="d.description" class="deck-desc">{{ d.description }}</p>
              <div class="deck-meta mono">{{ d.rowCount }} row{{ d.rowCount === 1 ? '' : 's' }} · {{ d.columnCount }} col{{ d.columnCount === 1 ? '' : 's' }}</div>
              <span class="card-cta">{{ tab === 'mine' ? 'Edit deck →' : 'View deck →' }}</span>
            </div>
          </NuxtLink>
        </div>

        <p v-else class="empty">
          <template v-if="tab === 'mine'">No decks yet. <NuxtLink to="/decks/new" class="explore-link">Build your first one</NuxtLink>.</template>
          <template v-else>No community decks yet.</template>
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.lede { color: var(--ink-soft); line-height: 1.55; max-width: 60ch; margin: 0 0 20px; }
.doot { margin-bottom: 30px; }
.doot-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.doot-head h3, .browse-head h3 { margin: 0; font-size: 18px; }
.doot-sub { color: var(--mute); font-size: 13px; }
.browse-head { margin: 0 0 12px; }
.chips { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 16px; }
.chip { border: var(--bd) solid var(--line-soft); background: var(--surface); border-radius: 999px; padding: 8px 15px; font-weight: 700; font-size: 13px; color: var(--ink-soft); cursor: pointer; transition: all 0.12s; font-family: inherit; }
.chip:hover:not(:disabled) { border-color: var(--line); color: var(--ink); }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.on { background: var(--ink); color: var(--bg); border-color: var(--line); }
.chip .n { opacity: 0.7; margin-left: 3px; }
.deck-card { display: block; }
.deck-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.deck-top { display: flex; gap: 6px; flex-wrap: wrap; }
.badge.game { border-color: var(--c3); color: var(--c3); }
.deck-desc { color: var(--ink-soft); font-size: 14px; line-height: 1.45; margin: 0; }
.deck-meta { color: var(--mute); font-size: 12px; }
.card-cta { display: inline-block; margin-top: 2px; color: var(--primary); font-weight: 800; font-size: 14px; }
.badge.vis-public { border-color: var(--c5); color: var(--c5); }
.empty { color: var(--ink-soft); padding: 24px 0; line-height: 1.5; }
.explore-link { color: var(--primary); font-weight: 700; }
</style>
