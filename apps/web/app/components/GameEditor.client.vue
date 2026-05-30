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

// Offer image uploads whenever object storage is configured (the upload itself
// is session-gated; a logged-out click surfaces a "sign in" error).
const uploadsEnabled = ref(false)
onMounted(async () => {
  try {
    const c = await $fetch<{ enabled: boolean }>('/api/uploads/config')
    uploadsEnabled.value = !!c.enabled
  } catch {
    /* leave disabled */
  }
})
provide(IMAGE_UPLOAD, { enabled: uploadsEnabled, upload: useImageUpload() })

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

/** Validate one round's content against its block schema; return an error or ''. */
function roundError(inst: RoundInstance): string {
  const block = blockFor(inst)
  if (!block) return `Unknown block "${inst.block}"`
  const result = block.contentSchema.safeParse(inst.content)
  if (result.success) return ''
  const first = result.error.issues[0]
  const path = first?.path.join('.')
  return path ? `${path}: ${first?.message}` : (first?.message ?? 'Invalid')
}
const errors = computed(() => config.rounds.map(roundError))
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
  draft.value = { pluginId, config: structuredClone(toRaw(config)), themeId: themeId.value }
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
              <select v-model="visibility" class="sf-select" aria-label="Visibility">
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
          <span>Paste a markdown game spec, then Import. It replaces the rounds below.</span>
          <a href="https://github.com/virgilvox/doot-games/blob/main/docs/markdown-games.md" target="_blank" rel="noopener" class="ed-import-doc">Format guide ↗</a>
        </div>
        <textarea
          v-model="markdownText"
          class="sf-textarea ed-import-text"
          rows="10"
          placeholder="# My Game&#10;theme: cyber&#10;&#10;## guess&#10;prompt: Who is this?&#10;- Option A (correct)&#10;- Option B"
        />
        <div class="ed-import-actions">
          <button class="btn btn-primary btn-sm" :disabled="!markdownText.trim()" @click="importMarkdown">Import</button>
          <button class="btn btn-ghost btn-sm" @click="showImport = false">Cancel</button>
        </div>
        <ul v-if="importWarnings.length" class="ed-import-warn">
          <li v-for="(w, i) in importWarnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <p v-if="!valid" class="ed-note">
        Fix the highlighted rounds and give the game a title to start hosting.
      </p>
      <p v-if="saveError" class="ed-note ed-note--err" role="alert">{{ saveError }}</p>
      <div v-if="savedId" class="ed-saved" role="status">
        <span>Saved. Share this link to host it from anywhere:</span>
        <NuxtLink :to="shareUrl" class="ed-saved-link mono">{{ shareUrl }}</NuxtLink>
        <NuxtLink :to="`/host/g/${savedId}`" class="btn btn-primary btn-sm">Host saved game →</NuxtLink>
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
              <SchemaForm
                v-if="blockFor(round)"
                :schema="blockFor(round)!.contentSchema"
                :model-value="contentOf(round)"
                @update:model-value="onContentUpdate(i, $event)"
              />
              <p v-if="errors[i]" class="sf-error" role="alert">{{ errors[i] }}</p>
            </div>
            <aside class="ed-preview">
              <div class="ed-preview-label">As players see it</div>
              <div class="ed-phone panel">
                <div class="kicker">{{ blockFor(round)?.name }}</div>
                <h3 class="ed-phone-prompt">{{ promptOf(round) }}</h3>
                <img
                  v-if="contentOf(round).image"
                  :src="contentOf(round).image as string"
                  alt=""
                  class="ed-phone-img"
                />
                <component
                  :is="blockFor(round)!.PlayerInput"
                  v-if="blockFor(round) && !errors[i]"
                  :content="round.content"
                  :model-value="previewValue(i)"
                  @update:model-value="previewInputs[i] = $event"
                />
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
  align-items: center;
  flex-wrap: wrap;
  font-size: 14px;
  color: var(--ink-soft);
  margin-bottom: 10px;
}
.ed-import-doc {
  color: var(--primary);
  font-weight: 700;
  white-space: nowrap;
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
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  background: color-mix(in srgb, var(--c5, var(--primary)) 12%, var(--surface));
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 12px 16px;
  margin: 0 0 16px;
  font-size: 14px;
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
