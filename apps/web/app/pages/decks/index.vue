<script setup lang="ts">
/** The deck library: browse your decks + public decks, and make new ones. A deck is
 *  reusable content (a table of rows) that games bind to or copy in. */
import { computed, ref } from 'vue'

interface DeckSummary {
  id: string
  name: string
  description: string | null
  kind: 'generic' | 'quiz' | 'prompt' | 'card'
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
const tab = ref<'mine' | 'public'>(loggedIn.value ? 'mine' : 'public')

const { data: mineData } = await useFetch<{ decks: DeckSummary[] }>('/api/decks', {
  query: { scope: 'mine' },
  default: () => ({ decks: [] }),
})
const { data: publicData } = await useFetch<{ decks: DeckSummary[] }>('/api/decks', {
  default: () => ({ decks: [] }),
})
const decks = computed(() => (tab.value === 'mine' ? (mineData.value?.decks ?? []) : (publicData.value?.decks ?? [])))

const kindLabel = { generic: 'Generic', quiz: 'Quiz', prompt: 'Prompt', card: 'Card' } as const
const visLabel = { private: 'Private', unlisted: 'Unlisted', public: 'Public' } as const
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
          A deck is a table of rows (questions, prompts, images) that games pull from. Build one here, then in
          the game editor either snapshot it into a game or link it live so edits follow.
        </p>

        <div class="chips">
          <button class="chip" :class="{ on: tab === 'mine' }" :disabled="!loggedIn" @click="tab = 'mine'">My decks <span class="n mono">{{ mineData?.decks.length ?? 0 }}</span></button>
          <button class="chip" :class="{ on: tab === 'public' }" @click="tab = 'public'">Public <span class="n mono">{{ publicData?.decks.length ?? 0 }}</span></button>
        </div>

        <div v-if="!loggedIn && tab === 'mine'" class="empty">
          <p><NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to build and save decks.</p>
        </div>

        <div v-else-if="decks.length" class="grid">
          <NuxtLink v-for="d in decks" :key="d.id" :to="tab === 'mine' ? `/decks/${d.id}/edit` : `/decks/${d.id}`" class="card deck-card">
            <div class="deck-body">
              <div class="deck-top">
                <span class="badge type">{{ kindLabel[d.kind] }}</span>
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
          <template v-else>No public decks yet.</template>
        </p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.lede { color: var(--ink-soft); line-height: 1.55; max-width: 60ch; margin: 0 0 20px; }
.chips { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 22px; }
.chip { border: var(--bd) solid var(--line-soft); background: var(--surface); border-radius: 999px; padding: 8px 15px; font-weight: 700; font-size: 13px; color: var(--ink-soft); cursor: pointer; transition: all 0.12s; font-family: inherit; }
.chip:hover:not(:disabled) { border-color: var(--line); color: var(--ink); }
.chip:disabled { opacity: 0.4; cursor: default; }
.chip.on { background: var(--ink); color: var(--bg); border-color: var(--line); }
.chip .n { opacity: 0.7; margin-left: 3px; }
.deck-card { display: block; }
.deck-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; }
.deck-top { display: flex; gap: 6px; }
.deck-desc { color: var(--ink-soft); font-size: 14px; line-height: 1.45; margin: 0; }
.deck-meta { color: var(--mute); font-size: 12px; }
.card-cta { display: inline-block; margin-top: 2px; color: var(--primary); font-weight: 800; font-size: 14px; }
.badge.vis-public { border-color: var(--c5); color: var(--c5); }
.empty { color: var(--ink-soft); padding: 24px 0; line-height: 1.5; }
.explore-link { color: var(--primary); font-weight: 700; }
</style>
