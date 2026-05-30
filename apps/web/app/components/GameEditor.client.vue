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
import { getBlock, getPlugin } from '@doot-games/games'
import { themeList } from '@doot-games/themes'
import { IMAGE_UPLOAD, SchemaForm } from '@doot-games/ui'
import { computed, provide, reactive, ref, toRaw, watch } from 'vue'

const props = defineProps<{ pluginId: string }>()
const router = useRouter()
const draft = useGameDraft()
const themeState = useState<string>('doot-theme', () => 'doot')

const plugin = getPlugin(props.pluginId)
if (!plugin) throw createError({ statusCode: 404, statusMessage: `Unknown game type: ${props.pluginId}` })

// Seed from the type's default composition (deep-cloned so edits stay local).
const config = reactive<GameComposition>(structuredClone(toRaw(plugin.defaultConfig)))
const themeId = ref(themeState.value)
const themes = themeList.map((t) => ({ id: t.id, name: t.name }))
const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
const visibility = ref<'private' | 'unlisted' | 'public'>('private')

// Offer image uploads in the editor's image fields when storage is configured
// and the user is signed in; otherwise fields stay URL-only.
const uploadsEnabled = ref(false)
const { data: uploadCfg } = useFetch('/api/uploads/config', { default: () => ({ enabled: false }) })
watch(uploadCfg, (v) => { uploadsEnabled.value = !!v?.enabled }, { immediate: true })
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

function hostGame() {
  if (!valid.value) return
  themeState.value = themeId.value
  draft.value = { pluginId: props.pluginId, config: structuredClone(toRaw(config)), themeId: themeId.value }
  router.push(`/host/${props.pluginId}`)
}

// Save the composition to the durable store and surface a shareable link.
const saving = ref(false)
const saveError = ref('')
const savedId = ref<string | null>(null)
async function saveGame() {
  if (!valid.value || saving.value) return
  // Saving requires an account; hosting/playing never do.
  if (!loggedIn.value) {
    router.push(`/login?redirect=/editor/${props.pluginId}`)
    return
  }
  saving.value = true
  saveError.value = ''
  try {
    const res = await $fetch<{ id: string }>('/api/games', {
      method: 'POST',
      body: {
        pluginId: props.pluginId,
        themeId: themeId.value,
        visibility: visibility.value,
        config: toRaw(config),
      },
    })
    savedId.value = res.id
  } catch (e) {
    saveError.value = (e as { statusMessage?: string })?.statusMessage ?? 'Could not save the game.'
  } finally {
    saving.value = false
  }
}
const shareUrl = computed(() => (savedId.value ? `/g/${savedId.value}` : ''))
// Editing again invalidates the saved snapshot's "saved" indicator.
watch(
  () => JSON.stringify(config),
  () => {
    savedId.value = null
  },
)
</script>

<template>
  <main>
    <div class="wrap editor">
      <header class="ed-head">
        <div>
          <span class="kicker">Editing · {{ plugin.manifest.name }}</span>
          <input v-model="config.title" class="ed-title" placeholder="Game title" aria-label="Game title" />
        </div>
        <div class="ed-actions">
          <label class="ed-theme">
            <span class="sf-label">Theme</span>
            <select v-model="themeId" class="sf-select" aria-label="Theme">
              <option v-for="t in themes" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </label>
          <label class="ed-theme">
            <span class="sf-label">Visibility</span>
            <select v-model="visibility" class="sf-select" aria-label="Visibility">
              <option value="private">Private</option>
              <option value="unlisted">Unlisted (link only)</option>
              <option value="public">Public (listed)</option>
            </select>
          </label>
          <button class="btn btn-ghost" :disabled="!valid || saving" @click="saveGame">
            {{ saving ? 'Saving…' : loggedIn ? 'Save' : 'Log in to save' }}
          </button>
          <button class="btn btn-primary" :disabled="!valid" @click="hostGame">Host now →</button>
        </div>
      </header>

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
        <li v-for="(round, i) in config.rounds" :key="i" class="ed-round" :class="{ open: expanded === i, bad: errors[i] }">
          <button type="button" class="ed-round-head" @click="toggle(i)">
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
  gap: 10px;
}
.ed-theme .sf-select {
  width: auto;
  min-width: 130px;
}
.ed-note {
  color: var(--ink-soft);
  font-size: 14px;
  margin: 0 0 16px;
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
  border-radius: 15px;
  background: var(--surface);
  overflow: hidden;
}
.ed-round.bad {
  border-color: color-mix(in srgb, var(--primary) 55%, var(--line-soft));
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
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
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
