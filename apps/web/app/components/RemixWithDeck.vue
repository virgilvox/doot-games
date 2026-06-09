<script setup lang="ts">
/**
 * "Remix": for a pool-driven flagship (a plugin with a `contentPool`), let a creator play
 * the game with their own content. Two warm starts, chosen by the game's shape:
 *
 * - SINGLE-COLUMN games (prompt / story pools): an inline editor PRE-FILLED with a small
 *   subset of the official content. The creator tweaks a few lines, adds their own, and
 *   hits play. No blank page, no overwhelm, the official set is the starting point.
 * - MULTI-COLUMN games (quiz / card pools): a deck picker (their decks + official Doot
 *   decks, which are badged), since multi-column rows need the full deck editor.
 *
 * Either way it saves a game that references the deck under the reserved `pool` key; the
 * host re-runs buildConfig over the deck rows. Self-contained: reuses /api/decks +
 * /api/games + the host route.
 */
import { deckMatchesPool, getPlugin, poolStarter } from '@doot-games/games'
import { computed, ref } from 'vue'

const props = defineProps<{ pluginId: string; gameName: string }>()

const plugin = getPlugin(props.pluginId)
const pool = plugin?.contentPool ?? null
// A small editable starter from the official pool (single-column games only).
const starter = pool ? poolStarter(pool, 6) : { single: false, key: '', values: [] }

const NOUNS: Record<string, { one: string; many: string }> = {
  prompt: { one: 'prompt', many: 'prompts' },
  quiz: { one: 'question', many: 'questions' },
  card: { one: 'card', many: 'cards' },
  generic: { one: 'story', many: 'stories' },
}
const noun = computed(() => NOUNS[pool?.deckKind ?? 'prompt'] ?? { one: 'deck', many: 'decks' })
const buttonLabel = computed(() => (pool?.deckKind === 'prompt' ? 'Remix with your prompts' : `Remix with your ${noun.value.many}`))
// A nudge to keep template syntax when the examples carry it.
const formatHint = computed(() => {
  if (props.pluginId === 'split-room') return 'Keep the {x} where players fill in the blank.'
  if (pool?.deckKind === 'generic') return 'Keep the {tokens} as blanks; players fill each one.'
  return 'Players never see them all at once; the host shuffles and picks how many to play.'
})

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)

interface DeckSummary {
  id: string
  name: string
  kind: string
  rowCount: number
  columnCount: number
  columns?: string[]
  authorName?: string | null
  authorHandle?: string | null
}
const open = ref(false)
// 'starter' = the inline editor; 'pick' = the deck picker.
const mode = ref<'starter' | 'pick'>('starter')
const error = ref('')
const creating = ref(false)

// Inline-starter state.
const lines = ref<string[]>([])
const deckName = ref('')

// Picker state.
const loading = ref(false)
const decks = ref<DeckSummary[]>([])

async function start() {
  if (!loggedIn.value) {
    await navigateTo(`/login?redirect=${encodeURIComponent(`/game/${props.pluginId}`)}`)
    return
  }
  open.value = true
  error.value = ''
  if (starter.single) {
    mode.value = 'starter'
    lines.value = [...starter.values]
    deckName.value = `My ${props.gameName}`
  } else {
    mode.value = 'pick'
    await loadDecks()
  }
}

async function loadDecks() {
  mode.value = 'pick'
  loading.value = true
  error.value = ''
  try {
    const [mine, pub] = await Promise.all([
      $fetch<{ decks: DeckSummary[] }>('/api/decks', { query: { scope: 'mine' } }),
      $fetch<{ decks: DeckSummary[] }>('/api/decks'),
    ])
    const want = pool?.deckKind
    const seen = new Set<string>()
    decks.value = [...(mine.decks ?? []), ...(pub.decks ?? [])].filter(
      (d) =>
        (!want || d.kind === want) &&
        // Hide a deck whose columns can't feed this specific game (e.g. a short-answer quiz
        // deck offered to a multiple-choice game), so a pick never silently falls back.
        (!d.columns || !pool || deckMatchesPool(d.columns, pool)) &&
        !seen.has(d.id) &&
        seen.add(d.id),
    )
  } catch {
    error.value = 'Could not load your decks.'
  } finally {
    loading.value = false
  }
}

const isOfficial = (d: DeckSummary) => d.authorName === 'Doot' || d.authorHandle === 'doot'

function addLine() {
  if (lines.value.length < 50) lines.value.push('')
}
function removeLine(i: number) {
  lines.value.splice(i, 1)
}

/** Create a private deck from the edited lines, save a remix that references it, go play. */
async function createFromStarter() {
  if (creating.value || !plugin || !pool) return
  const values = lines.value.map((s) => s.trim()).filter(Boolean)
  if (!values.length) {
    error.value = `Add at least one ${noun.value.one}.`
    return
  }
  creating.value = true
  error.value = ''
  const name = deckName.value.trim() || `My ${props.gameName}`
  try {
    const deck = await $fetch<{ id: string }>('/api/decks', {
      method: 'POST',
      body: {
        name,
        kind: pool.deckKind,
        visibility: 'private',
        columns: [{ key: starter.key, label: noun.value.one, type: 'text' }],
        rows: values.map((v) => ({ [starter.key]: v })),
      },
    })
    const game = await $fetch<{ id: string }>('/api/games', {
      method: 'POST',
      body: {
        pluginId: props.pluginId,
        config: { title: `${props.gameName} (${name})`, rounds: plugin.defaultConfig.rounds, decks: { pool: { ref: deck.id } } },
      },
    })
    await navigateTo(`/g/${game.id}`)
  } catch {
    error.value = 'Could not save your remix.'
    creating.value = false
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
        config: { title: `${props.gameName}: ${deck.name}`, rounds: plugin.defaultConfig.rounds, decks: { pool: { ref: deck.id } } },
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
    <button type="button" class="btn btn-ghost btn-lg" @click="start">{{ buttonLabel }}</button>

    <div v-if="open" class="rx-overlay" @click.self="open = false">
      <div class="rx-sheet" role="dialog" aria-modal="true" :aria-label="`Remix ${gameName}`">
        <div class="rx-head">
          <h2>Make {{ gameName }} your own</h2>
          <button type="button" class="rx-x" aria-label="Close" @click="open = false">✕</button>
        </div>

        <!-- Inline starter: edit a small subset of the official content. -->
        <template v-if="mode === 'starter'">
          <p class="rx-sub">Start from the official {{ noun.many }} and make them yours. {{ formatHint }}</p>
          <label class="rx-name">
            <span>Name</span>
            <input v-model="deckName" type="text" maxlength="80" :placeholder="`My ${gameName}`" />
          </label>
          <ul class="rx-lines">
            <li v-for="(l, i) in lines" :key="i">
              <textarea
                :value="l"
                rows="1"
                maxlength="280"
                :aria-label="`${noun.one} ${i + 1}`"
                @input="lines[i] = ($event.target as HTMLTextAreaElement).value"
              />
              <button type="button" class="rx-x rx-line-x" :aria-label="`Remove ${noun.one} ${i + 1}`" @click="removeLine(i)">✕</button>
            </li>
          </ul>
          <button type="button" class="rx-add" @click="addLine">+ Add a {{ noun.one }}</button>
          <p v-if="error" class="rx-err">{{ error }}</p>
          <div class="rx-actions">
            <button type="button" class="btn btn-primary" :disabled="creating" @click="createFromStarter">
              {{ creating ? 'Saving…' : 'Create and host' }}
            </button>
            <button type="button" class="rx-link rx-switch" @click="loadDecks">or use a deck you saved</button>
          </div>
        </template>

        <!-- Picker: their decks + official Doot decks (badged). -->
        <template v-else>
          <p class="rx-sub">Pick a {{ noun.one }} deck. Official Doot decks and any you have built both work.</p>
          <p v-if="loading" class="rx-empty">Loading decks…</p>
          <template v-else>
            <p v-if="error" class="rx-err">{{ error }}</p>
            <p v-if="!decks.length" class="rx-empty">
              No {{ noun.one }} decks yet. <NuxtLink :to="`/decks/new?kind=${pool.deckKind}`" class="rx-link">Build one</NuxtLink>, then come back to remix.
            </p>
            <ul v-else class="rx-list">
              <li v-for="d in decks" :key="d.id">
                <button type="button" class="rx-deck" :disabled="creating" @click="pick(d)">
                  <span class="rx-name-row">
                    <span class="rx-deck-name">{{ d.name }}</span>
                    <span v-if="isOfficial(d)" class="rx-badge">Official</span>
                  </span>
                  <span class="rx-meta">{{ d.rowCount }} {{ noun.many }}</span>
                </button>
              </li>
            </ul>
            <div class="rx-actions">
              <NuxtLink :to="`/decks/new?kind=${pool.deckKind}`" class="rx-link">+ Build a new {{ noun.one }} deck</NuxtLink>
              <button v-if="starter.single" type="button" class="rx-link rx-switch" @click="start">or start from the official ones</button>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.remix { display: inline-block; }
.rx-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.rx-sheet { background: var(--surface); border: var(--bd) solid var(--line); border-radius: var(--radius-lg); padding: 20px; width: 100%; max-width: 480px; max-height: 84vh; overflow: auto; box-shadow: var(--shadow); }
.rx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.rx-head h2 { font-size: 18px; margin: 0; }
.rx-x { background: none; border: none; color: var(--mute); cursor: pointer; font-size: 16px; }
.rx-sub { color: var(--ink-soft); line-height: 1.5; margin: 0 0 14px; font-size: 14px; }
.rx-name { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 13px; font-weight: 700; color: var(--mute); }
.rx-name input { font: inherit; font-weight: 600; color: var(--ink); padding: 9px 12px; border: var(--bd) solid var(--line-soft); border-radius: var(--radius); background: var(--surface-2); }
.rx-lines { list-style: none; margin: 0 0 8px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rx-lines li { display: flex; align-items: flex-start; gap: 8px; }
.rx-lines textarea { flex: 1; font: inherit; color: var(--ink); padding: 9px 12px; border: var(--bd) solid var(--line-soft); border-radius: var(--radius); background: var(--surface-2); resize: vertical; min-height: 38px; line-height: 1.4; }
.rx-line-x { padding-top: 9px; }
.rx-add { background: none; border: none; color: var(--primary); font-weight: 700; cursor: pointer; font: inherit; padding: 4px 0; }
.rx-err { color: var(--primary); margin: 8px 0 0; }
.rx-empty { color: var(--ink-soft); line-height: 1.5; }
.rx-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
.rx-list { list-style: none; margin: 0 0 4px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rx-deck { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; background: var(--surface-2); border: var(--bd) solid var(--line-soft); border-radius: var(--radius); padding: 11px 14px; cursor: pointer; font: inherit; color: var(--ink); }
.rx-deck:hover:not(:disabled) { border-color: var(--ink); }
.rx-name-row { display: flex; align-items: center; gap: 8px; }
.rx-deck-name { font-weight: 800; }
.rx-badge { font-size: 10px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: var(--surface); background: var(--primary); border-radius: 999px; padding: 2px 7px; }
.rx-meta { font-size: 12px; color: var(--mute); }
.rx-link { color: var(--primary); font-weight: 700; cursor: pointer; background: none; border: none; font: inherit; padding: 0; }
.rx-switch { color: var(--mute); }
</style>
