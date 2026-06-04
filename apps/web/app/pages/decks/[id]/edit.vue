<script setup lang="ts">
/** Edit one of your library decks. Owner only — the API returns the full deck only
 *  to its owner (private) or anyone with the link (unlisted/public); a non-owner can
 *  view but the editor's save will 404 server-side, so we gate to the owner here. */
import { computed } from 'vue'

const route = useRoute()
const id = computed(() => String(route.params.id))

interface LoadedDeck {
  id: string
  name: string
  description: string | null
  kind: 'generic' | 'quiz' | 'prompt' | 'card'
  visibility: 'private' | 'unlisted' | 'public'
  remixable: boolean
  columns: Array<{ key: string; label: string; type: 'text' | 'image' | 'number' }>
  rows: Array<Record<string, string | number | null>>
  isOwner: boolean
}

const { data: deck, error } = await useFetch<LoadedDeck>(() => `/api/decks/${id.value}`)
if (error.value || !deck.value) {
  throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
}
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section editor-section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Content library</span><h2>Edit deck</h2></div>
          <NuxtLink to="/decks" class="btn btn-ghost btn-sm">← All decks</NuxtLink>
        </div>
        <div v-if="deck && !deck.isOwner" class="empty">
          <p>This deck belongs to someone else. <NuxtLink :to="`/decks/${id}`" class="explore-link">View it</NuxtLink> instead.</p>
        </div>
        <DeckEditor v-else-if="deck" :initial="deck" />
      </section>
    </div>
  </main>
</template>

<style scoped>
.editor-section { max-width: 1000px; }
.empty { color: var(--ink-soft); padding: 24px 0; line-height: 1.5; }
.explore-link { color: var(--primary); font-weight: 700; }
</style>
