<script setup lang="ts">
/** Read-only view of a deck (its columns + a sample of rows). Owners get an Edit
 *  link; if the deck is remixable, anyone signed in can copy it to their library. */
import { computed, ref } from 'vue'

const route = useRoute()
const id = computed(() => String(route.params.id))
const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)

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
  authorName: string | null
  authorHandle: string | null
}

const { data: deck, error } = await useFetch<LoadedDeck>(() => `/api/decks/${id.value}`)
if (error.value || !deck.value) {
  throw createError({ statusCode: 404, statusMessage: 'Deck not found' })
}

const kindLabel = { generic: 'Generic', quiz: 'Quiz', prompt: 'Prompt', card: 'Card' } as const
const sample = computed(() => deck.value?.rows.slice(0, 12) ?? [])

const copying = ref(false)
async function copyToLibrary() {
  if (copying.value) return
  copying.value = true
  try {
    const res = await $fetch<{ id: string }>(`/api/decks/${id.value}/clone`, { method: 'POST' })
    await navigateTo(`/decks/${res.id}/edit`)
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <main v-if="deck">
    <div class="wrap">
      <section class="section" style="padding-top: 34px">
        <NuxtLink to="/decks" class="back">← All decks</NuxtLink>
        <div class="head">
          <div>
            <span class="badge type">{{ kindLabel[deck.kind] }}</span>
            <h1>{{ deck.name }}</h1>
            <p v-if="deck.description" class="desc">{{ deck.description }}</p>
            <p class="byline">
              <template v-if="deck.authorHandle"><NuxtLink :to="`/u/${deck.authorHandle}`" class="explore-link">@{{ deck.authorHandle }}</NuxtLink> · </template>
              <template v-else-if="deck.authorName">{{ deck.authorName }} · </template>
              {{ deck.rows.length }} rows · {{ deck.columns.length }} columns
            </p>
          </div>
          <div class="actions">
            <NuxtLink v-if="deck.isOwner" :to="`/decks/${deck.id}/edit`" class="btn btn-primary btn-sm">Edit deck</NuxtLink>
            <button v-else-if="deck.remixable && loggedIn" class="btn btn-primary btn-sm" :disabled="copying" @click="copyToLibrary">{{ copying ? 'Copying…' : 'Copy to my library' }}</button>
          </div>
        </div>

        <div class="grid-wrap">
          <table class="grid">
            <thead>
              <tr><th v-for="c in deck.columns" :key="c.key">{{ c.label || c.key }}<small v-if="c.type !== 'text'"> · {{ c.type }}</small></th></tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in sample" :key="i">
                <td v-for="c in deck.columns" :key="c.key">
                  <img v-if="c.type === 'image' && r[c.key]" :src="String(r[c.key])" alt="" class="thumb" />
                  <span v-else>{{ r[c.key] }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="deck.rows.length > sample.length" class="more mono">+ {{ deck.rows.length - sample.length }} more rows</p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.back { color: var(--ink-soft); font-weight: 700; font-size: 14px; display: inline-block; margin-bottom: 14px; }
.head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 22px; }
.head h1 { margin: 8px 0 6px; }
.desc { color: var(--ink-soft); line-height: 1.5; margin: 0 0 8px; max-width: 60ch; }
.byline { color: var(--mute); font-size: 13px; margin: 0; }
.actions { display: flex; gap: 10px; }
.grid-wrap { overflow-x: auto; border: var(--bd) solid var(--line-soft); border-radius: var(--radius); }
.grid { border-collapse: collapse; width: 100%; font-size: 13px; }
.grid th { text-align: left; padding: 8px 10px; border-bottom: var(--bd) solid var(--line); background: var(--surface-2); white-space: nowrap; }
.grid th small { color: var(--mute); font-weight: 600; }
.grid td { padding: 7px 10px; border-bottom: var(--bd) solid var(--line-soft); }
.thumb { width: 34px; height: 34px; object-fit: cover; border-radius: 5px; }
.more { color: var(--mute); font-size: 12px; padding: 10px; margin: 0; }
.explore-link { color: var(--primary); font-weight: 700; }
</style>
