<script setup lang="ts">
/**
 * "Remix with your prompts": for a pool-driven flagship (a plugin with a `contentPool`),
 * let a creator attach one of their content decks so the game plays THEIR content. Picks
 * a deck of the game's expected kind (e.g. a Prompt Deck), then saves a game that
 * references it under the reserved `pool` key — the host re-runs buildConfig over the
 * deck rows. Self-contained: reuses /api/decks + createGame + the host route.
 */
import { getPlugin } from '@doot-games/games'
import { computed, ref } from 'vue'

const props = defineProps<{ pluginId: string; gameName: string }>()

const plugin = getPlugin(props.pluginId)
const pool = plugin?.contentPool ?? null
// What the creator's rows are called, per deck kind, so the copy reads naturally for a
// prompt game ("your prompts") and a typed one ("your questions", "your cards").
const NOUNS: Record<string, { one: string; many: string }> = {
  prompt: { one: 'prompt', many: 'prompts' },
  quiz: { one: 'question', many: 'questions' },
  card: { one: 'card', many: 'cards' },
  generic: { one: 'story', many: 'stories' },
}
const noun = computed(() => NOUNS[pool?.deckKind ?? 'prompt'] ?? { one: 'deck', many: 'decks' })
const buttonLabel = computed(() => (pool?.deckKind === 'prompt' ? 'Remix with your prompts' : `Remix with your ${noun.value.many}`))

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)

interface DeckSummary {
  id: string
  name: string
  kind: string
  rowCount: number
  columnCount: number
}
const open = ref(false)
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const decks = ref<DeckSummary[]>([])

async function openPicker() {
  if (!loggedIn.value) {
    await navigateTo(`/login?redirect=${encodeURIComponent(`/game/${props.pluginId}`)}`)
    return
  }
  open.value = true
  loading.value = true
  error.value = ''
  try {
    const [mine, pub] = await Promise.all([
      $fetch<{ decks: DeckSummary[] }>('/api/decks', { query: { scope: 'mine' } }),
      $fetch<{ decks: DeckSummary[] }>('/api/decks'),
    ])
    const want = pool?.deckKind
    const seen = new Set<string>()
    decks.value = [...(mine.decks ?? []), ...(pub.decks ?? [])]
      .filter((d) => (!want || d.kind === want) && !seen.has(d.id) && seen.add(d.id))
  } catch {
    error.value = 'Could not load your decks.'
  } finally {
    loading.value = false
  }
}

async function pick(deck: DeckSummary) {
  if (creating.value || !plugin) return
  creating.value = true
  error.value = ''
  try {
    const res = await $fetch<{ id: string }>('/api/games', {
      method: 'POST',
      body: {
        pluginId: props.pluginId,
        config: {
          title: `${props.gameName} — ${deck.name}`,
          rounds: plugin.defaultConfig.rounds,
          decks: { pool: { ref: deck.id } },
        },
      },
    })
    await navigateTo(`/g/${res.id}`)
  } catch {
    error.value = 'Could not save your remix.'
    creating.value = false
  }
}
</script>

<template>
  <div v-if="pool" class="remix">
    <button type="button" class="btn btn-ghost btn-lg" @click="openPicker">{{ buttonLabel }}</button>

    <div v-if="open" class="rx-overlay" @click.self="open = false">
      <div class="rx-sheet" role="dialog" aria-modal="true" aria-label="Pick a deck to remix with">
        <div class="rx-head">
          <h2>Play {{ gameName }} with your own {{ noun.many }}</h2>
          <button type="button" class="rx-x" aria-label="Close" @click="open = false">✕</button>
        </div>
        <p v-if="loading" class="rx-empty">Loading your decks…</p>
        <template v-else>
          <p v-if="error" class="rx-err">{{ error }}</p>
          <p v-if="!decks.length" class="rx-empty">
            No {{ noun.one }} decks yet. <NuxtLink :to="`/decks/new?kind=${pool.deckKind}`" class="rx-link">Build one</NuxtLink>, then come back to remix.
          </p>
          <ul v-else class="rx-list">
            <li v-for="d in decks" :key="d.id">
              <button type="button" class="rx-deck" :disabled="creating" @click="pick(d)">
                <span class="rx-name">{{ d.name }}</span>
                <span class="rx-meta">{{ d.rowCount }} rows · {{ d.columnCount }} cols</span>
              </button>
            </li>
          </ul>
          <NuxtLink :to="`/decks/new?kind=${pool.deckKind}`" class="rx-link rx-new">+ New {{ noun.one }} deck</NuxtLink>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remix { display: inline-block; }
.rx-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.rx-sheet { background: var(--surface); border: var(--bd) solid var(--line); border-radius: var(--radius-lg); padding: 20px; width: 100%; max-width: 460px; max-height: 80vh; overflow: auto; box-shadow: var(--shadow); }
.rx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.rx-head h2 { font-size: 18px; margin: 0; }
.rx-x { background: none; border: none; color: var(--mute); cursor: pointer; font-size: 16px; }
.rx-empty { color: var(--ink-soft); line-height: 1.5; }
.rx-err { color: var(--primary); }
.rx-list { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rx-deck { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: var(--surface-2); border: var(--bd) solid var(--line-soft); border-radius: var(--radius); padding: 11px 14px; cursor: pointer; font: inherit; color: var(--ink); }
.rx-deck:hover:not(:disabled) { border-color: var(--ink); }
.rx-name { font-weight: 800; }
.rx-meta { font-size: 12px; color: var(--mute); }
.rx-link { color: var(--primary); font-weight: 700; }
.rx-new { display: inline-block; margin-top: 4px; }
</style>
