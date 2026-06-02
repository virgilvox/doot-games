<script setup lang="ts">
/**
 * The schema-driven game editor. It seeds from a game type's default
 * composition, then lets the host edit the title and the ordered list of
 * rounds, each round authored by a form auto-generated from its block's
 * `contentSchema` (via @doot-games/ui's SchemaForm), with a live preview of the
 * phone view. "Host this game" stashes the composition in the draft and opens
 * the host screen. Client-only: it mounts block player views and uses the draft.
 */
import type { AnyBlock, GameComposition, RoundInstance } from '@doot-games/sdk'
import { getBlock, getPlugin, parseMarkdownGame } from '@doot-games/games'
import { themeList } from '@doot-games/themes'
import { GameTypeIcon, IMAGE_UPLOAD, ImageField, SchemaForm, gameVisual } from '@doot-games/ui'
import { computed, onMounted, onScopeDispose, provide, reactive, ref, toRaw, watch } from 'vue'

/** A saved game loaded into the editor (to edit in place or fork). */
interface EditableGame {
  id: string
  pluginId: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
  config: GameComposition
}

const props = defineProps<{ pluginId?: string; initialGame?: EditableGame; canEdit?: boolean }>()
const router = useRouter()
const route = useRoute()
const draft = useGameDraft()
const themeState = useState<string>('doot-theme', () => 'doot')

const source = props.initialGame
const pluginId = source?.pluginId ?? props.pluginId ?? ''
const plugin = getPlugin(pluginId)
if (!plugin) throw createError({ statusCode: 404, statusMessage: `Unknown game type: ${pluginId}` })

// Edit in place (PUT) only when the viewer owns the loaded game; a loaded game
// the viewer doesn't own is a fork (saves as a new game, POST).
const editId = computed(() => (source && props.canEdit ? source.id : null))
const isFork = computed(() => !!source && !props.canEdit)

// Seed from the loaded game, or the type's default composition (deep-cloned).
const config = reactive<GameComposition>(structuredClone(toRaw(source?.config ?? plugin.defaultConfig)))
const themeId = ref(source?.themeId ?? themeState.value)
// Apply the game's theme to the editor live, so picking a theme restyles the
// editor (and its preview) exactly as it will look when hosted. This drives the
// global ThemeProvider; "Host now"/Save carry the same `themeId`.
watch(themeId, (t) => { themeState.value = t }, { immediate: true })
const themes = themeList.map((t) => ({ id: t.id, name: t.name }))
const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
const visibility = ref<'private' | 'unlisted' | 'public'>(source?.visibility ?? 'private')
const description = ref(source?.description ?? '')
const tagsText = ref((source?.tags ?? []).join(', '))
const coverImage = ref(source?.coverImage ?? '')
const forkable = ref(source?.forkable ?? false)
const showDetails = ref(false)
const headerLabel = computed(() => (isFork.value ? 'Forking' : editId.value ? 'Editing' : 'New'))
// Plain-language meaning of each visibility level, shown next to the picker and
// when a game is saved (so "I shared the link but my friend gets a 404" never
// happens silently).
const VISIBILITY_NOTE: Record<'private' | 'unlisted' | 'public', string> = {
  private: 'Private: only you can open this. Set it to Unlisted or Public before sharing the link.',
  unlisted: 'Unlisted: anyone with the link can play it, but it is not listed anywhere.',
  public: 'Public: anyone can play it and it is listed on Explore for others to find.',
}
const visibilityNote = computed(() => VISIBILITY_NOTE[visibility.value])

// Image uploads need object storage configured AND a signed-in author (the
// presign route is session-gated). Rather than show an Upload button that 401s
// for a logged-out author, only offer it when both hold, and otherwise explain
// why (so they sign in, or just paste a URL, which always works). Computed off
// `loggedIn` so the button appears the moment they sign in mid-edit.
const storageConfigured = ref(false)
onMounted(async () => {
  try {
    const c = await $fetch<{ enabled: boolean; signedIn: boolean }>('/api/uploads/config')
    storageConfigured.value = !!c.enabled
  } catch {
    /* leave disabled */
  }
})
const uploadsEnabled = computed(() => storageConfigured.value && loggedIn.value)
const uploadReason = computed(() =>
  storageConfigured.value && !loggedIn.value
    ? 'Sign in to upload images. You can paste an image URL without signing in.'
    : '',
)
provide(IMAGE_UPLOAD, { enabled: uploadsEnabled, upload: useImageUpload(), reason: uploadReason })

const blockChoices = computed(() => plugin.blocks)
function blockFor(inst: RoundInstance): AnyBlock | undefined {
  return getBlock(plugin!, inst.block)
}
// Typed content accessors (template can't carry inline casts cleanly).
function contentOf(inst: RoundInstance): Record<string, unknown> {
  return inst.content as Record<string, unknown>
}
function promptOf(inst: RoundInstance): string {
  return (inst.content as { prompt?: string }).prompt ?? ''
}
function summaryOf(inst: RoundInstance): string {
  const c = inst.content as { subject?: string; prompt?: string }
  return c.subject || c.prompt || '-'
}
/** Per-block accent color, so each round card is visually distinct by kind. */
function blockColor(inst: RoundInstance): string {
  return gameVisual(inst.block).color
}
function onContentUpdate(i: number, value: Record<string, unknown>) {
  config.rounds[i]!.content = value
  resetPreview(i)
}

// ── two-phase (make → judge) rounds ──────────────────────────────────────
// A "judge" round (Vote/Split) builds its content at runtime from the answers a
// previous round collects, so the editor explains that and hides the fields it
// fills in automatically (the placeholder option ids/text an author should never
// touch). See the block's `derive`/`derivedFields`.
function isDerived(inst: RoundInstance): boolean {
  return !!blockFor(inst)?.derive
}
function derivedFieldsOf(inst: RoundInstance): string[] {
  return blockFor(inst)?.derivedFields ?? []
}
/** The round a derived round draws its content from (default: the prior round). */
function sourceIndexFor(i: number): number | null {
  const inst = config.rounds[i]
  if (!inst) return null
  const from = inst.from
  const src = from && from.length ? from[from.length - 1]! : i - 1
  return src >= 0 && src < config.rounds.length ? src : null
}
/** The thing a derived block produces (its first derived field), e.g. "options". */
function derivedNoun(inst: RoundInstance): string {
  return derivedFieldsOf(inst)[0] ?? 'options'
}
function sourceName(i: number): string {
  const src = sourceIndexFor(i)
  return src === null ? '' : (blockFor(config.rounds[src]!)?.name ?? 'the previous round')
}

/** Validate one round's content against its block schema; return an error or ''. */
function roundError(inst: RoundInstance, i: number): string {
  const block = blockFor(inst)
  if (!block) return `Unknown block "${inst.block}"`
  const result = block.contentSchema.safeParse(inst.content)
  if (!result.success) {
    const first = result.error.issues[0]
    const path = first?.path.join('.')
    return path ? `${path}: ${first?.message}` : (first?.message ?? 'Invalid')
  }
  // A judge round (Vote/Split) needs an earlier round to build its options from.
  if (block.derive && sourceIndexFor(i) === null) {
    return 'This round builds on the round before it. Add a writing round (Quip or Fill) above it.'
  }
  return ''
}
const errors = computed(() => config.rounds.map((r, i) => roundError(r, i)))
const valid = computed(() => config.title.trim().length > 0 && config.rounds.length > 0 && errors.value.every((e) => !e))

// Live preview of the phone view per round, a local input value, no relay.
// Read without mutating (so it's safe during render); writes happen on
// interaction and when a round's content changes.
const previewInputs = reactive<Record<number, unknown>>({})
function previewValue(i: number): unknown {
  if (i in previewInputs) return previewInputs[i]
  const block = blockFor(config.rounds[i]!)
  return block ? block.emptyInput(config.rounds[i]!.content) : null
}
function resetPreview(i: number) {
  const block = blockFor(config.rounds[i]!)
  if (block) previewInputs[i] = block.emptyInput(config.rounds[i]!.content)
}

// Preview surface: the phone (what each player taps) vs the big screen (what the
// whole room watches). A host author's primary artifact is the TV, so they need
// to see it too. Host views render via <HostPreview>, which provides a mock room
// so they show their open, no-answers-yet state.
const previewMode = ref<'phone' | 'host'>('phone')

const addKind = ref(plugin.blocks[0]?.kind ?? '')
function addRound() {
  const block = getBlock(plugin!, addKind.value)
  if (!block) return
  config.rounds.push({ block: block.kind, content: block.defaultContent() })
}
function removeRound(i: number) {
  config.rounds.splice(i, 1)
  delete previewInputs[i]
}
function moveRound(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= config.rounds.length) return
  const [r] = config.rounds.splice(i, 1)
  config.rounds.splice(j, 0, r!)
}

const expanded = ref<number | null>(0)
function toggle(i: number) {
  expanded.value = expanded.value === i ? null : i
}

// Import a whole game from a markdown spec (see docs/markdown-games.md). Rounds
// using blocks this game type doesn't support are dropped with a note (the
// Custom type supports every block).
const showImport = ref(false)
const markdownText = ref('')
const importWarnings = ref<string[]>([])

// A complete, valid example so a creator can see the format and tweak it,
// instead of having to leave for the docs.
const MARKDOWN_EXAMPLE = `# Trivia & Vibes Night
theme: playful

## guess
prompt: What year did the first iPhone launch?
timer: 20
- 2007 (correct)
- 2005
- 2010

## poll
prompt: Pineapple on pizza?
- Absolutely
- Never
- Only sometimes

## rate
prompt: Rate tonight's playlist
categories: Energy, Variety
scale: 1-10`

// A ready-to-paste prompt for an AI assistant: hand it your topic and it returns
// a spec you paste straight into the box below. This is the "I don't want to
// learn a format, I'll ask an AI" path.
const AI_PROMPT = `Write a party game for Doot as a Markdown spec. Output ONLY the spec, no commentary or code fences.

Format:
# Game Title
theme: doot        (or: cutesie, cyber, professional, playful)

Then one or more rounds. Each round is a "## type" heading, then "key: value" lines and "- item" lines:

## guess  - multiple choice with ONE right answer. Fields: prompt, timer (seconds). List 2+ "- choice"; mark the correct one with "(correct)".
## poll   - opinion, no right answer. Fields: prompt. List 2+ "- choice".
## rank   - players put items in order. Fields: prompt. List 2+ "- item".
## rate   - score things on a scale. Fields: prompt, "categories: A, B, C", "scale: 1-5" (or letters like "F, D, C, B, A").
## draw   - players sketch it. Fields: prompt, timer.

Now make a game about: <YOUR TOPIC HERE>, with about 5 rounds. Mix the round types for variety.`

const copiedPrompt = ref(false)
async function copyAiPrompt() {
  try {
    await navigator.clipboard.writeText(AI_PROMPT)
    copiedPrompt.value = true
    setTimeout(() => {
      copiedPrompt.value = false
    }, 2000)
  } catch {
    /* clipboard blocked: the prompt is still visible to select manually */
  }
}
function loadExample() {
  markdownText.value = MARKDOWN_EXAMPLE
}
function importMarkdown() {
  const parsed = parseMarkdownGame(markdownText.value)
  const supported = new Set(plugin!.blocks.map((b) => b.kind))
  const kept = parsed.rounds.filter((r) => supported.has(r.block))
  const dropped = parsed.rounds.length - kept.length
  config.title = parsed.title
  if (parsed.themeId && themes.some((t) => t.id === parsed.themeId)) themeId.value = parsed.themeId
  if (kept.length) {
    config.rounds.splice(0, config.rounds.length, ...kept)
    for (const k of Object.keys(previewInputs)) delete previewInputs[Number(k)]
    expanded.value = 0
  }
  importWarnings.value = [
    ...parsed.warnings,
    dropped > 0
      ? `${dropped} round(s) use blocks not in ${plugin!.manifest.name}. Open the Custom game type to use any block.`
      : '',
  ].filter(Boolean)
  if (kept.length) showImport.value = false
}

function hostGame() {
  if (!valid.value) return
  themeState.value = themeId.value
  // Deep-clone via JSON, not structuredClone(toRaw()): once the schema-form has
  // edited the config it holds nested Vue reactive proxies that toRaw only unwraps
  // at the top level, and structuredClone throws on them ("could not be cloned").
  // GameComposition is pure JSON data (it is persisted as JSON), so this is exact.
  draft.value = { pluginId, config: JSON.parse(JSON.stringify(config)), themeId: themeId.value }
  dirty.value = false // the work is preserved in the (now persisted) draft
  router.push(`/host/${pluginId}`)
}

// Save the composition to the durable store, then surface a shareable link.
const saving = ref(false)
const saveError = ref('')
const savedId = ref<string | null>(null)
function buildBody() {
  return {
    pluginId,
    themeId: themeId.value,
    visibility: visibility.value,
    // Send explicit (possibly empty) strings so an edit that clears a field
    // clears it server-side, the PUT only leaves *omitted* fields untouched.
    description: description.value.trim(),
    tags: tagsText.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8),
    coverImage: coverImage.value.trim(),
    forkable: forkable.value,
    config: toRaw(config),
  }
}
async function saveGame() {
  if (!valid.value || saving.value) return
  // Saving requires an account; hosting/playing never do.
  if (!loggedIn.value) {
    router.push(`/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    if (editId.value) {
      await $fetch(`/api/games/${editId.value}`, { method: 'PUT', body: buildBody() })
      savedId.value = editId.value
    } else {
      const res = await $fetch<{ id: string }>('/api/games', { method: 'POST', body: buildBody() })
      savedId.value = res.id
    }
    dirty.value = false
  } catch (e) {
    saveError.value = (e as { statusMessage?: string })?.statusMessage ?? 'Could not save the game.'
  } finally {
    saving.value = false
  }
}
const shareUrl = computed(() => (savedId.value ? `/g/${savedId.value}` : ''))
// Editing invalidates the "saved" indicator and marks the editor dirty so we can
// warn before the page is unloaded with unsaved work.
const dirty = ref(false)
watch(
  () => `${JSON.stringify(config)}|${description.value}|${tagsText.value}|${coverImage.value}|${visibility.value}|${forkable.value}|${themeId.value}`,
  () => {
    savedId.value = null
    dirty.value = true
  },
)

// Warn on refresh/close/navigation when there's unsaved work. Hosting an
// unsaved draft is safe now (it survives reload via sessionStorage), but a
// straight unload would still lose edits that were never saved or hosted.
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value && !savedId.value) {
    e.preventDefault()
    e.returnValue = ''
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))
</script>

<template>
  <main>
    <div class="wrap editor">
      <header class="ed-head">
        <div>
          <span class="kicker">{{ headerLabel }} · {{ plugin.manifest.name }}</span>
          <input v-model="config.title" class="ed-title" placeholder="Game title" aria-label="Game title" />
        </div>
        <div class="ed-actions">
          <div class="ed-settings" role="group" aria-label="Game settings">
            <div class="ed-field">
              <span class="ed-label">Theme</span>
              <div class="ed-swatches" role="group" aria-label="Theme">
                <button
                  v-for="t in themeList"
                  :key="t.id"
                  type="button"
                  class="ed-swatch"
                  :class="{ on: themeId === t.id }"
                  :title="t.name"
                  :aria-label="`Theme: ${t.name}`"
                  :aria-pressed="themeId === t.id"
                  :style="{ background: `linear-gradient(135deg, ${t.tokens.primary}, ${t.tokens.c1})` }"
                  @click="themeId = t.id"
                />
              </div>
            </div>
            <label class="ed-field">
              <span class="ed-label">Visibility</span>
              <select v-model="visibility" class="sf-select" aria-label="Visibility" :title="visibilityNote">
                <option value="private">Private</option>
                <option value="unlisted">Unlisted (link only)</option>
                <option value="public">Public (listed)</option>
              </select>
            </label>
            <button type="button" class="ed-toggle" :class="{ on: showDetails }" :aria-pressed="showDetails" @click="showDetails = !showDetails">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h5l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z" /></svg>
              Details
            </button>
            <button type="button" class="ed-toggle" :class="{ on: showImport }" :aria-pressed="showImport" @click="showImport = !showImport">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              Import
            </button>
          </div>
          <div class="ed-primary">
            <button class="btn btn-ghost" :disabled="!valid || saving" @click="saveGame">
              {{ saving ? 'Saving…' : !loggedIn ? 'Log in to save' : editId ? 'Save changes' : isFork ? 'Save copy' : 'Save' }}
            </button>
            <button class="btn btn-primary" :disabled="!valid" @click="hostGame">Host now →</button>
          </div>
        </div>
      </header>

      <div v-if="showDetails" class="ed-details">
        <ImageField label="Cover image" :model-value="coverImage" @update:model-value="coverImage = $event" />
        <label class="sf-field">
          <span class="sf-label">Description</span>
          <textarea v-model="description" class="sf-textarea" rows="2" maxlength="300" placeholder="One line about your game (shown on cards)." />
        </label>
        <label class="sf-field">
          <span class="sf-label">Tags (comma-separated)</span>
          <input v-model="tagsText" class="sf-input" placeholder="trivia, party, music" />
        </label>
        <label class="sf-toggle">
          <input type="checkbox" v-model="forkable" />
          <span>Let others fork (copy) this game</span>
        </label>
      </div>

      <div v-if="showImport" class="ed-import">
        <div class="ed-import-head">
          <div>
            <strong>Build a whole game from a text spec.</strong>
            <p class="ed-import-lead">
              Don't want to fill in rounds by hand? Write (or have an AI write) a short spec and paste it
              here, then Import. It replaces the rounds below.
            </p>
          </div>
          <a href="https://github.com/virgilvox/doot-games/blob/main/docs/markdown-games.md" target="_blank" rel="noopener" class="ed-import-doc">Full guide ↗</a>
        </div>

        <div class="ed-import-actions ed-import-actions--top">
          <button class="btn btn-primary btn-sm" type="button" @click="copyAiPrompt">
            {{ copiedPrompt ? 'Copied! Paste it into your AI assistant' : 'Copy an AI prompt' }}
          </button>
          <button class="btn btn-ghost btn-sm" type="button" @click="loadExample">Load an example</button>
        </div>
        <p class="ed-import-tip">
          New here? Click <b>Copy an AI prompt</b>, paste it into your AI assistant with your topic, and paste
          what it gives you back into the box below. Or click <b>Load an example</b> to see the format.
        </p>

        <textarea
          v-model="markdownText"
          class="sf-textarea ed-import-text"
          rows="10"
          placeholder="# My Game&#10;theme: cyber&#10;&#10;## guess&#10;prompt: Who is this?&#10;timer: 20&#10;- Option A (correct)&#10;- Option B"
        />
        <div class="ed-import-actions">
          <button class="btn btn-primary btn-sm" :disabled="!markdownText.trim()" @click="importMarkdown">Import</button>
          <button class="btn btn-ghost btn-sm" @click="showImport = false">Cancel</button>
        </div>
        <ul v-if="importWarnings.length" class="ed-import-warn">
          <li v-for="(w, i) in importWarnings" :key="i">{{ w }}</li>
        </ul>

        <details class="ed-import-fmt">
          <summary>The format, in brief</summary>
          <div class="ed-import-fmt-body">
            <p>
              <code>#&nbsp;Title</code> at the top, an optional <code>theme:</code>, then one
              <code>##&nbsp;type</code> heading per round with <code>key: value</code> lines and
              <code>-&nbsp;item</code> choices. Round types you can use:
            </p>
            <ul>
              <li><b>guess</b>: multiple choice with one right answer. Mark it <code>(correct)</code>. <code>timer:</code> in seconds.</li>
              <li><b>poll</b>: opinion, no right answer. Just list the choices.</li>
              <li><b>rank</b>: players drag items into order. List the items.</li>
              <li><b>rate</b>: score on a scale. <code>categories: A, B</code> and <code>scale: 1-5</code> (or letters like <code>F, D, C, B, A</code>).</li>
              <li><b>draw</b>: players sketch the prompt.</li>
            </ul>
            <p class="ed-import-tip">
              Unknown lines are ignored; rounds that need attention are flagged below once imported.
            </p>
          </div>
        </details>
      </div>

      <p v-if="!valid" class="ed-note">
        Fix the highlighted rounds and give the game a title to start hosting.
      </p>
      <p v-if="saveError" class="ed-note ed-note--err" role="alert">{{ saveError }}</p>
      <div v-if="savedId" class="ed-saved" role="status">
        <div class="ed-saved-row">
          <span>Saved. Share this link to host it from anywhere:</span>
          <NuxtLink :to="shareUrl" class="ed-saved-link mono">{{ shareUrl }}</NuxtLink>
          <NuxtLink :to="`/host/g/${savedId}`" class="btn btn-primary btn-sm">Host saved game →</NuxtLink>
        </div>
        <p class="ed-saved-vis">{{ visibilityNote }}</p>
      </div>

      <ol class="ed-rounds">
        <li
          v-for="(round, i) in config.rounds"
          :key="i"
          class="ed-round"
          :class="{ open: expanded === i, bad: errors[i] }"
          :style="{ '--round-accent': blockColor(round) }"
        >
          <button type="button" class="ed-round-head" @click="toggle(i)">
            <GameTypeIcon :type="round.block" :size="34" />
            <span class="ed-round-n">Round {{ i + 1 }}</span>
            <span class="ed-round-kind">{{ blockFor(round)?.name ?? round.block }}</span>
            <span class="ed-round-subject">{{ summaryOf(round) }}</span>
            <span v-if="errors[i]" class="ed-round-err" :title="errors[i]">needs attention</span>
            <span class="ed-round-controls" @click.stop>
              <button type="button" class="sf-icon-btn" :disabled="i === 0" aria-label="Move up" @click="moveRound(i, -1)">↑</button>
              <button type="button" class="sf-icon-btn" :disabled="i === config.rounds.length - 1" aria-label="Move down" @click="moveRound(i, 1)">↓</button>
              <button type="button" class="sf-icon-btn" aria-label="Remove round" @click="removeRound(i)">✕</button>
            </span>
          </button>

          <div v-if="expanded === i" class="ed-round-body">
            <div class="ed-form">
              <!-- Judge rounds (Vote/Split) are built from the previous round's
                   answers at runtime; explain that instead of showing the empty
                   option fields. -->
              <div v-if="isDerived(round)" class="ed-derived" :class="{ bad: errors[i] }">
                <svg class="ed-derived-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></svg>
                <div class="ed-derived-body" v-if="sourceIndexFor(i) !== null">
                  <strong>Built automatically from Round {{ sourceIndexFor(i)! + 1 }}.</strong>
                  <p>
                    You don't fill in the {{ derivedNoun(round) }} here. Whatever players write in
                    Round {{ sourceIndexFor(i)! + 1 }} ({{ sourceName(i) }}) becomes the answers everyone
                    votes on, shuffled and anonymized. You only set the prompt and timer below.
                  </p>
                </div>
                <div class="ed-derived-body" v-else>
                  <strong>This round needs a writing round before it.</strong>
                  <p>
                    A {{ blockFor(round)?.name }} round builds its {{ derivedNoun(round) }} from the answers
                    collected in the round right above it. Add a Quip or Fill round before this one.
                  </p>
                </div>
              </div>
              <SchemaForm
                v-if="blockFor(round)"
                :schema="blockFor(round)!.contentSchema"
                :hide="derivedFieldsOf(round)"
                :model-value="contentOf(round)"
                @update:model-value="onContentUpdate(i, $event)"
              />
              <p v-if="errors[i]" class="sf-error" role="alert">{{ errors[i] }}</p>
            </div>
            <aside class="ed-preview">
              <div class="ed-preview-head" role="group" aria-label="Preview surface">
                <button
                  type="button"
                  class="ed-pt-btn"
                  :class="{ on: previewMode === 'phone' }"
                  :aria-pressed="previewMode === 'phone'"
                  @click="previewMode = 'phone'"
                >
                  Phone
                </button>
                <button
                  type="button"
                  class="ed-pt-btn"
                  :class="{ on: previewMode === 'host' }"
                  :aria-pressed="previewMode === 'host'"
                  @click="previewMode = 'host'"
                >
                  Big screen
                </button>
              </div>

              <!-- PHONE: what each player taps on their own device -->
              <div v-if="previewMode === 'phone'" class="ed-phone panel">
                <div class="kicker">{{ blockFor(round)?.name }}</div>
                <h3 class="ed-phone-prompt">{{ promptOf(round) }}</h3>
                <img
                  v-if="contentOf(round).image"
                  :src="contentOf(round).image as string"
                  alt=""
                  class="ed-phone-img"
                />
                <!-- Derived rounds have no authored options to preview; show a
                     representative sample of what players will see at runtime. -->
                <template v-if="isDerived(round)">
                  <p class="ed-preview-hint">Filled in live from the previous round, for example:</p>
                  <ul class="ed-sample">
                    <li>An answer a player wrote</li>
                    <li>Another player's answer</li>
                    <li>A third answer</li>
                  </ul>
                </template>
                <component
                  :is="blockFor(round)!.PlayerInput"
                  v-else-if="blockFor(round) && !errors[i]"
                  :content="round.content"
                  :model-value="previewValue(i)"
                  @update:model-value="previewInputs[i] = $event"
                />
                <p v-else class="ed-preview-hint">Preview appears once this round is valid.</p>
              </div>

              <!-- BIG SCREEN: what the whole room watches on the TV/projector -->
              <div v-else class="ed-bigscreen panel">
                <div class="ed-bs-prompt-area">
                  <h3 class="ed-bs-prompt">{{ promptOf(round) }}</h3>
                  <img
                    v-if="contentOf(round).image"
                    :src="contentOf(round).image as string"
                    alt=""
                    class="ed-bs-img"
                  />
                </div>
                <div v-if="isDerived(round)" class="ed-bs-board">
                  <p class="ed-preview-hint">The big screen fills in live from the previous round.</p>
                </div>
                <!-- inert: the big-screen board is a non-interactive preview, so its
                     controls (e.g. a host "peek" button) stay out of mouse + tab reach. -->
                <div v-else-if="blockFor(round) && !errors[i]" class="ed-bs-board" inert>
                  <HostPreview :block="blockFor(round)!" :content="round.content" :index="i" />
                </div>
                <p v-else class="ed-preview-hint">Preview appears once this round is valid.</p>
              </div>
            </aside>
          </div>
        </li>
      </ol>

      <div class="ed-add">
        <select v-model="addKind" class="sf-select" aria-label="Block kind to add">
          <option v-for="b in blockChoices" :key="b.kind" :value="b.kind">{{ b.name }}</option>
        </select>
        <button type="button" class="btn btn-ghost" @click="addRound">+ Add round</button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.editor {
  padding: 28px 0 60px;
}
.ed-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.ed-title {
  display: block;
  margin-top: 8px;
  font-size: clamp(26px, 4vw, 38px);
  font-weight: 800;
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--line-soft);
  color: var(--ink);
  padding: 4px 2px;
  width: min(520px, 80vw);
  font-family: inherit;
}
.ed-title:focus {
  outline: none;
  border-bottom-color: var(--primary);
}
.ed-actions {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}
/* Group the game settings (theme, visibility, details, import) into one boxed
   cluster so they read as settings, not lost among the action buttons. */
.ed-settings {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
}
.ed-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.ed-field .sf-select {
  width: auto;
  min-width: 130px;
}
/* Clearly readable label, not muted grey. */
.ed-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink);
}
.ed-swatches {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 42px;
}
.ed-swatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--line);
  cursor: pointer;
  padding: 0;
  transition: transform 0.1s;
}
.ed-swatch:hover {
  transform: scale(1.12);
}
.ed-swatch.on {
  outline: 3px solid var(--ink);
  outline-offset: 1px;
}
.ed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  align-self: flex-end;
  height: 42px;
  padding: 0 14px;
  font-family: inherit;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  cursor: pointer;
  transition: all 0.12s;
}
.ed-toggle svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ed-toggle:hover {
  border-color: var(--line);
}
.ed-toggle.on {
  background: var(--ink);
  color: var(--bg);
  border-color: var(--line);
}
.ed-primary {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-left: auto;
}
@media (max-width: 760px) {
  .ed-head {
    flex-direction: column;
    align-items: stretch;
  }
  .ed-actions {
    width: 100%;
  }
  .ed-settings {
    flex: 1 1 100%;
  }
  .ed-primary {
    margin-left: 0;
    width: 100%;
  }
  .ed-primary .btn {
    flex: 1 1 auto;
  }
  .ed-title {
    width: 100%;
  }
}
.ed-note {
  color: var(--ink-soft);
  font-size: 14px;
  margin: 0 0 16px;
}
.ed-details {
  border: var(--bd) solid var(--line-soft);
  border-radius: 15px;
  background: var(--surface);
  padding: 16px;
  margin: 0 0 18px;
  display: grid;
  gap: 14px;
}
.btn-on {
  border-color: var(--primary);
  color: var(--primary);
}
.ed-import {
  border: var(--bd) solid var(--line-soft);
  border-radius: 15px;
  background: var(--surface);
  padding: 16px;
  margin: 0 0 18px;
}
.ed-import-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  flex-wrap: wrap;
  font-size: 14px;
  color: var(--ink-soft);
  margin-bottom: 10px;
}
.ed-import-head strong {
  font-size: 15px;
  color: var(--ink);
}
.ed-import-lead {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  max-width: 60ch;
}
.ed-import-doc {
  color: var(--primary);
  font-weight: 700;
  white-space: nowrap;
}
.ed-import-tip {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 8px 0 12px;
}
.ed-import-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  min-height: 200px;
}
.ed-import-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.ed-import-actions--top {
  margin-top: 4px;
}
.ed-import-fmt {
  margin-top: 14px;
  border-top: var(--bd) solid var(--line-soft);
  padding-top: 12px;
}
.ed-import-fmt summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 14px;
  color: var(--ink);
}
.ed-import-fmt-body {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.55;
  margin-top: 10px;
}
.ed-import-fmt-body ul {
  margin: 8px 0;
  padding-left: 20px;
  display: grid;
  gap: 5px;
}
.ed-import-fmt-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 5px;
  padding: 1px 5px;
}
.ed-import-warn {
  margin: 12px 0 0;
  padding-left: 18px;
  color: var(--primary);
  font-size: 13px;
}
.ed-note--err {
  color: var(--primary);
  font-weight: 600;
}
.ed-saved {
  background: color-mix(in srgb, var(--c5, var(--primary)) 12%, var(--surface));
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 12px 16px;
  margin: 0 0 16px;
  font-size: 14px;
}
.ed-saved-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ed-saved-vis {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
}
.ed-saved-link {
  font-weight: 700;
  color: var(--primary);
  word-break: break-all;
}
.ed-rounds {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.ed-round {
  border: var(--bd) solid var(--line-soft);
  border-left: 5px solid var(--round-accent, var(--line-soft));
  border-radius: 15px;
  background: var(--surface);
  overflow: hidden;
}
.ed-round.bad {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--line-soft));
  border-left-color: var(--primary);
}
.ed-round-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--ink);
  font-family: inherit;
}
.ed-round-n {
  font-weight: 800;
  font-size: 14px;
}
.ed-round-kind {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink);
  background: color-mix(in srgb, var(--round-accent, var(--primary)) 22%, transparent);
  padding: 3px 9px;
  border-radius: 999px;
}
.ed-round-subject {
  color: var(--ink-soft);
  font-size: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-round-err {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
}
.ed-round-controls {
  display: flex;
  gap: 6px;
}
.ed-round-body {
  display: grid;
  grid-template-columns: 1fr minmax(240px, 340px);
  gap: 22px;
  padding: 4px 16px 20px;
}
.ed-preview-label,
.ed-preview-hint {
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 700;
  margin-bottom: 8px;
}
.ed-phone {
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 16px;
}
.ed-phone-prompt {
  font-size: 20px;
  font-weight: 800;
}
.ed-phone-img {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
}
.ed-preview-hint {
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-soft);
  font-weight: 500;
}
/* Preview surface toggle: phone vs the big screen. */
.ed-preview-head {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  margin-bottom: 8px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
}
.ed-pt-btn {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--ink-soft);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 5px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.ed-pt-btn.on {
  background: var(--primary);
  color: var(--primary-ink);
}
/* Big-screen (host) preview: a framed "stage" distinct from the phone card. */
.ed-bigscreen {
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 16px;
  background: var(--surface-2);
}
.ed-bs-prompt-area {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.ed-bs-prompt {
  font-family: var(--font-display, inherit);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.15;
}
.ed-bs-img {
  width: 100%;
  max-height: 160px;
  object-fit: contain;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
}
.ed-bs-board {
  /* The real host view is sized for a projector; scale it down to the editor
     column. `zoom` shrinks layout and clamp()-based fonts proportionally
     (supported in Chromium, WebKit, and Firefox 126+). */
  zoom: 0.62;
  border-top: var(--bd) solid var(--line-soft);
  padding-top: 16px;
  /* Belt-and-suspenders with `inert`: it's a preview, not a control surface. */
  pointer-events: none;
}
/* Two-phase "this round is built automatically" explainer. */
.ed-derived {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: color-mix(in srgb, var(--round-accent, var(--primary)) 12%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--round-accent, var(--primary)) 40%, var(--line-soft));
  border-radius: 13px;
  padding: 14px 16px;
  margin-bottom: 16px;
}
.ed-derived.bad {
  background: color-mix(in srgb, var(--primary) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--primary) 55%, var(--line-soft));
}
.ed-derived-ic {
  width: 24px;
  height: 24px;
  flex: none;
  margin-top: 1px;
  fill: none;
  stroke: var(--round-accent, var(--primary));
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ed-derived-body strong {
  display: block;
  font-size: 15px;
  margin-bottom: 3px;
}
.ed-derived-body p {
  margin: 0;
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
}
.ed-sample {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.ed-sample li {
  border: var(--bd) dashed var(--line-soft);
  border-radius: 11px;
  padding: 11px 13px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-soft);
  background: var(--surface-2);
}
.ed-add {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-top: 18px;
}
.ed-add .sf-select {
  width: auto;
  min-width: 160px;
}
@media (max-width: 820px) {
  .ed-round-body {
    grid-template-columns: 1fr;
  }
}
</style>
