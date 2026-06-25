<script setup lang="ts">
/**
 * The schema-driven game editor. It seeds from a game type's default
 * composition, then lets the host edit the title and the ordered list of
 * rounds, each round authored by a form auto-generated from its block's
 * `contentSchema` (via @doot-games/ui's SchemaForm), with a live preview of the
 * phone view. "Host this game" stashes the composition in the draft and opens
 * the host screen. Client-only: it mounts block player views and uses the draft.
 */
import type { AnyBlock, GameComposition, GroupDef, RoundInstance } from '@doot-games/sdk'
import { getBlock, getPlugin, parseMarkdownGame, resolveComposition } from '@doot-games/games'
import { themeList } from '@doot-games/themes'
import { AudioClip, GameTypeIcon, IMAGE_UPLOAD, ImageField, SchemaForm, gameVisual } from '@doot-games/ui'
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

// ── Add-round model ───────────────────────────────────────────────────────
// Standalone blocks the author can add on their own. A derived "judge" block
// (vote/split/fibvote/drawvote/accuse) needs a make round feeding it, so it is
// never offered alone; a make-only block (quip/fill/...) collects input but
// scores nothing by itself, so it is only offered inside a two-phase recipe.
const MAKE_ONLY = new Set(['quip', 'fill', 'bars', 'faker', 'spotlight'])
const singleBlocks = computed(() => plugin!.blocks.filter((b) => !b.derive && !MAKE_ONLY.has(b.kind)))
// One-line "what is this" for each standalone block, shown on the Add cards.
const SINGLE_DESC: Record<string, string> = {
  guess: 'Multiple choice with one right answer.',
  rate: 'Score things on a scale.',
  poll: 'An opinion vote, no right answer.',
  rank: 'Players drag items into order.',
  draw: 'Players sketch the prompt.',
  hivemind: 'Free-text answers; score by matching the crowd.',
  mostlikely: 'Vote on who in the room fits the prompt.',
  ballpark: 'Closest numeric guess wins.',
  buzzer: 'First correct buzz takes the points.',
  collect: 'Everyone shares a photo (or a line); the screen fills with a gallery.',
}
function singleDesc(kind: string): string {
  return SINGLE_DESC[kind] ?? ''
}
// Two-phase recipes: each inserts a make round + the judge round derived from
// it, the only way to build a Jackbox-style game by hand. Offered only when the
// plugin composes BOTH halves (so a single-type editor shows none).
interface Recipe {
  id: string
  name: string
  description: string
  make: string
  judge: string
  /** Optional content overrides merged onto each block's defaultContent, so two
   *  recipes that share the same blocks (e.g. Write & Vote vs Caption This) can
   *  start from different prompts/fields. */
  makeContent?: Record<string, unknown>
  judgeContent?: Record<string, unknown>
}
const ALL_RECIPES: Recipe[] = [
  { id: 'write-vote', name: 'Write & Vote', description: 'Everyone writes an answer, then the room votes for the best one.', make: 'quip', judge: 'vote' },
  { id: 'caption-vote', name: 'Caption This', description: 'Players write a caption for an image you pick, then the room votes for the funniest.', make: 'quip', judge: 'vote', makeContent: { prompt: 'Write a caption for this image.', image: '' }, judgeContent: { prompt: 'Which caption wins?' } },
  { id: 'madlib-vote', name: 'Mad Lib & Vote', description: 'Players fill in the blanks, then vote on the funniest result.', make: 'fill', judge: 'vote' },
  { id: 'would-you-split', name: 'Would You & Split', description: 'Players write would-you dares, then the room votes yes or no on each.', make: 'fill', judge: 'split' },
  { id: 'lie-detector', name: 'Lie Detector', description: 'Players write convincing lies; you set the real truth; the room hunts it down.', make: 'quip', judge: 'fibvote' },
  { id: 'sketch-vote', name: 'Sketch & Vote', description: 'Everyone draws the prompt, then votes for the best drawing.', make: 'draw', judge: 'drawvote' },
  { id: 'hidden-faker', name: 'Hidden Faker', description: 'One player secretly fakes knowing the word; everyone gives a clue, then the room accuses.', make: 'faker', judge: 'accuse' },
  { id: 'share-vote', name: 'Share & Vote', description: 'Everyone shares a photo for the prompt, then the room votes for the best one.', make: 'collect', judge: 'photovote' },
]
const recipes = computed(() => {
  const kinds = new Set(plugin!.blocks.map((b) => b.kind))
  return ALL_RECIPES.filter((r) => kinds.has(r.make) && kinds.has(r.judge))
})
/** A block kind's display name (for the recipe cards, so the make/judge blocks a
 *  recipe is built from are visible). */
function kindName(kind: string): string {
  return getBlock(plugin!, kind)?.name ?? kind
}
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

// ── content decks (DeckManager + RoundBindings live in their own components) ──
const deckCount = computed(() => Object.keys(config.decks ?? {}).length)
function onBindingsChange(i: number, payload: { draw?: number; bindings?: Record<string, { deck: string; column: string }> }) {
  const r = config.rounds[i]
  if (!r) return
  // undefined drops on serialize (gameInputSchema treats draw/bindings as optional).
  r.draw = payload.draw
  r.bindings = payload.bindings
}

// A linked (library `{ ref }`) deck doesn't carry its columns/rows in the config, so
// fetch them: the columns feed the binding dropdowns, the rows feed the live preview.
// Cached per deck id; keyed in the maps by the config's deck key. The persisted config
// keeps the `{ ref }` untouched — this is editor-only resolution.
type EdDeckColumn = { key: string; label: string; type: 'text' | 'image' | 'number' }
type EdRefDeck = { columns: EdDeckColumn[]; rows: Record<string, string | number | null>[]; name?: string }
const refDecks = reactive<Record<string, EdRefDeck>>({})
const refCache = new Map<string, EdRefDeck>()
const refColumns = computed(() => Object.fromEntries(Object.entries(refDecks).map(([k, v]) => [k, v.columns])))
watch(
  () => config.decks,
  async (decks) => {
    for (const [key, use] of Object.entries(decks ?? {})) {
      if (!use || !('ref' in use) || !use.ref) continue
      const cached = refCache.get(use.ref)
      if (cached) {
        refDecks[key] = cached
        continue
      }
      try {
        const d = await $fetch<{ columns: EdDeckColumn[]; rows: Record<string, string | number | null>[]; name?: string }>(`/api/decks/${use.ref}`)
        const deck = { columns: d.columns ?? [], rows: d.rows ?? [], name: d.name }
        refCache.set(use.ref, deck)
        refDecks[key] = deck
      } catch {
        refDecks[key] = { columns: [], rows: [] }
      }
    }
  },
  { deep: true, immediate: true },
)

// A pool-fed flagship (e.g. a Quip Clash or Quiz or Die remix) plays its attached `pool`
// deck, not the authored rounds: the host re-runs buildConfig over the deck's rows. So when
// one is attached, the rounds below are only a preview. Surface that, and the live deck.
const poolDeck = computed(() => {
  const use = config.decks?.pool
  if (!plugin?.contentPool || !use) return null
  const ref = 'ref' in use ? use.ref : null
  const meta = refDecks.pool
  const rows = ref ? (meta?.rows.length ?? 0) : 'inline' in use ? use.inline.rows.length : 0
  return { ref, name: meta?.name ?? null, rows }
})
// ── play-time variable: pull a shared photo from a prior collect round ───────
/** The nearest prior round that is a `collect` block (a source of play-time shares). */
function priorCollectIndex(i: number): number | null {
  for (let k = i - 1; k >= 0; k--) if (config.rounds[k]?.block === 'collect') return k
  return null
}
/** The selected round can pull a shared photo when a prior collect round exists and this
 *  block has an `image` field to fill. Returns that collect round's index, else null. */
const shareSource = computed(() => {
  const r = config.rounds[selected.value]
  if (!r || isDerived(r)) return null
  const src = priorCollectIndex(selected.value)
  if (src === null) return null
  const fields = blockFor(r)?.defaultContent() as Record<string, unknown> | undefined
  return fields && 'image' in fields ? src : null
})
const usesShare = computed(() => !!config.rounds[selected.value]?.fromShares)
function toggleShare(on: boolean) {
  const r = config.rounds[selected.value]
  if (!r) return
  r.fromShares = on && shareSource.value !== null ? { from: shareSource.value, field: 'image', value: 'media', pick: 'random' } : undefined
}

/** config.decks with each linked `{ ref }` swapped for its fetched inline data, so the
 *  preview can draw real rows from a library deck (editor-only; never persisted). */
const previewDecks = computed(() => {
  const out: Record<string, unknown> = {}
  for (const [key, use] of Object.entries(config.decks ?? {})) {
    out[key] = use && 'ref' in use && refDecks[key] ? { inline: refDecks[key] } : use
  }
  return out
})

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

// The selected round drives the center form and the right-pane preview. Below
// ~1000px the preview collapses into a drawer (showPreviewDrawer).
const selected = ref(0)
const showPreviewDrawer = ref(false)
const cur = computed(() => config.rounds[selected.value])
// Preview content: for a deck-backed round, resolve a single sample instance so
// bound fields show a real drawn row (the binding's effect is otherwise host-time);
// for an ordinary round it is just the authored content.
const previewContent = computed<Record<string, unknown>>(() => {
  const inst = cur.value
  if (!inst) return {}
  if (!inst.bindings && !inst.pool) return contentOf(inst)
  try {
    const sample = resolveComposition(plugin!, { title: '', rounds: [{ ...inst, draw: 1 }], decks: previewDecks.value as typeof config.decks }, 'preview')
    return (sample.rounds[0]?.content as Record<string, unknown>) ?? contentOf(inst)
  } catch {
    return contentOf(inst)
  }
})
const previewPrompt = computed(() => (previewContent.value.prompt as string | undefined) ?? '')
// A display block (slide / title card) renders its whole view itself, so the preview
// must NOT add the generic kicker/prompt/image chrome around it (that double-shows
// the slide's image).
const curIsDisplay = computed(() => !!(cur.value && blockFor(cur.value)?.display))
// Preview the answering state or the reveal (so an author can see the answer moment
// they configured, e.g. a Guess round's focused answer + reveal image). Only offered
// when the current block actually has a reveal.
const previewState = ref<'open' | 'reveal'>('open')
const canPreviewReveal = computed(() => {
  // Derived (judge) rounds render a "built live from the previous round" placeholder,
  // not the real block view, so a reveal preview would have nothing to show.
  if (!cur.value || isDerived(cur.value)) return false
  const b = blockFor(cur.value)
  return !!b && (!!b.answerOf || !!b.revealSummary || !!b.PlayerReveal)
})
// Drop back to the open state when moving to a round that has no reveal to show.
watch([selected, canPreviewReveal], () => {
  if (!canPreviewReveal.value) previewState.value = 'open'
})

// The big-screen preview is rendered at a real 16:9 logical resolution (1280x720) and
// scaled to fit the pane, so it reads like an actual TV/projector (the real layout and
// proportions, not a cramped reflow). Measure the surface to set the scale.
const BIG_SCREEN_W = 1280
const previewSurface = ref<HTMLElement | null>(null)
const previewW = ref(420)
let previewRO: ResizeObserver | null = null
watch(previewSurface, (el) => {
  previewRO?.disconnect()
  if (!el) return
  previewRO = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect.width
    if (w) previewW.value = w
  })
  previewRO.observe(el)
})
onScopeDispose(() => previewRO?.disconnect())
// The frame has a 7px bezel each side; the stage fills the inner width.
const bsScale = computed(() => Math.max(0.12, (previewW.value - 14) / BIG_SCREEN_W))
function select(i: number) {
  selected.value = i
  showPreviewDrawer.value = false
}
// previewInputs is keyed by round index; clear it on any structural change so a
// shifted round never shows the previous occupant's in-progress input.
function clearPreviews() {
  for (const k of Object.keys(previewInputs)) delete previewInputs[Number(k)]
}

// The Add panel and Import open as overlays. Game details are inline in the top
// bar: description + tags under the title, the cover as a small popover off an
// icon, and "Remixable" as a checkbox next to the visibility picker.
const showAdd = ref(false)
const showCover = ref(false)
function addSingle(kind: string) {
  const block = getBlock(plugin!, kind)
  if (!block) return
  config.rounds.push({ block: block.kind, content: block.defaultContent() })
  selected.value = config.rounds.length - 1
  showAdd.value = false
}
function addRecipe(recipe: Recipe) {
  const make = getBlock(plugin!, recipe.make)
  const judge = getBlock(plugin!, recipe.judge)
  if (!make || !judge) return
  // Push the make round then the judge round derived from it; the judge's
  // default source is the round right above it, so adjacency wires the pair. A
  // recipe may override fields onto the defaults (e.g. Caption This sets a caption
  // prompt + an empty image the author fills in via the uploader).
  config.rounds.push({ block: make.kind, content: { ...make.defaultContent(), ...(recipe.makeContent ?? {}) } })
  config.rounds.push({ block: judge.kind, content: { ...judge.defaultContent(), ...(recipe.judgeContent ?? {}) } })
  selected.value = config.rounds.length - 2 // land on the make round
  showAdd.value = false
}
function removeRound(i: number) {
  config.rounds.splice(i, 1)
  clearPreviews()
  if (selected.value >= config.rounds.length) selected.value = Math.max(0, config.rounds.length - 1)
  else if (selected.value > i) selected.value -= 1
}
function moveRound(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= config.rounds.length) return
  const [r] = config.rounds.splice(i, 1)
  config.rounds.splice(j, 0, r!)
  clearPreviews()
  // Keep the selection following the round the author just moved.
  if (selected.value === i) selected.value = j
  else if (selected.value === j) selected.value = i
}

// ── Drag to reorder + drag in/out of sections (native HTML5 DnD; arrows stay for
// keyboard + touch) ──
// The scrollable rail; auto-scrolled while dragging so an offscreen target (a loose
// round or another section below the fold) is reachable without letting go.
const railEl = ref<HTMLElement | null>(null)
function autoScroll(e: DragEvent) {
  const el = railEl.value
  if (!el || dragIndex.value === null) return
  const r = el.getBoundingClientRect()
  const edge = 56
  if (e.clientY < r.top + edge) el.scrollTop -= 14
  else if (e.clientY > r.bottom - edge) el.scrollTop += 14
}
const dragIndex = ref<number | null>(null)
// The insertion gap (0..rounds.length) the drop lands at, for the indicator line.
const dropGap = ref<number | null>(null)
// Which section the drop lands in: a group id (join that section) or null (loose, out
// of every section). Set by whichever section box / rail gutter the cursor is over, so
// the drop does exactly what the highlighted box shows. No hidden inference.
const dropGroup = ref<string | null>(null)
const isDragging = computed(() => dragIndex.value !== null)
const dropTargetGroup = computed(() => dropGroup.value ?? undefined)
const dropTargetName = computed(() => groupById(dropGroup.value ?? undefined)?.name?.trim() || 'No section')

function onDragStart(i: number, e: DragEvent) {
  dragIndex.value = i
  dropGroup.value = config.rounds[i]?.group ?? null
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(i)) // Firefox needs data set to drag
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 16, 16)
  }
}
// Over a round: set the insertion position (top half -> before, bottom half -> after)
// AND the drop target = the section of the round you're hovering (a loose round drops
// loose). Reading the hovered round directly is robust: it never gets stuck on the
// section you started in, so dragging OUT (onto a loose round) always works.
function onDragOver(i: number, e: DragEvent) {
  if (dragIndex.value === null) return
  e.preventDefault() // required so the drop fires
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  dropGap.value = e.clientY < rect.top + rect.height / 2 ? i : i + 1
  dropGroup.value = config.rounds[i]?.group ?? null
}
// Over a section box but not on one of its rounds (the header / padding): still drop
// INTO this section. No stopPropagation, so the round handlers above stay authoritative.
function onSectionDragOver(groupId: string, e: DragEvent) {
  if (dragIndex.value === null) return
  e.preventDefault()
  dropGroup.value = groupId
}
// The rail gutter only needs to allow a drop (so releasing between rows still lands);
// it does NOT change the target, so it can't override a hovered round's section.
function onRailDragOver(e: DragEvent) {
  if (dragIndex.value === null) return
  e.preventDefault()
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  e.stopPropagation() // handle once (item drop), not again as it bubbles to box/rail
  if (dragIndex.value !== null && dropGap.value !== null) moveRoundTo(dragIndex.value, dropGap.value, dropGroup.value)
  endDrag()
}
function endDrag() {
  dragIndex.value = null
  dropGap.value = null
  dropGroup.value = null
}
// Move a round to the insertion gap and set its section to exactly where it was dropped
// (a section box -> that group; the gutter -> loose). Selection follows the round you
// were editing (by identity), not its index.
function moveRoundTo(from: number, gap: number, group: string | null) {
  const editing = config.rounds[selected.value]
  let dest = gap > from ? gap - 1 : gap
  dest = Math.max(0, Math.min(dest, config.rounds.length - 1))
  if (dest !== from) {
    const [r] = config.rounds.splice(from, 1)
    config.rounds.splice(dest, 0, r!)
  }
  const moved = config.rounds[dest]
  if (!moved) return
  if (group) moved.group = group
  else delete moved.group
  pruneGroups()
  clearPreviews()
  if (editing) selected.value = Math.max(0, config.rounds.indexOf(editing))
}

// The rail as a list of loose rounds and section boxes (a contiguous run of rounds
// sharing a group). Rendering sections as visible containers makes it obvious what a
// section holds and lets the author drag rounds into and out of the box.
interface RailLoose {
  type: 'loose'
  round: RoundInstance
  index: number
}
interface RailSection {
  type: 'section'
  group: GroupDef
  items: Array<{ round: RoundInstance; index: number }>
}
const railRows = computed<Array<RailLoose | RailSection>>(() => {
  const rows: Array<RailLoose | RailSection> = []
  config.rounds.forEach((round, index) => {
    const gid = round.group
    if (gid) {
      const last = rows[rows.length - 1]
      if (last && last.type === 'section' && last.group.id === gid) last.items.push({ round, index })
      else rows.push({ type: 'section', group: groupById(gid) ?? { id: gid, name: '' }, items: [{ round, index }] })
    } else {
      rows.push({ type: 'loose', round, index })
    }
  })
  return rows
})
function dropAboveAt(i: number): boolean {
  return isDragging.value && dropGap.value === i
}
function dropBelowAt(i: number): boolean {
  return isDragging.value && dropGap.value === config.rounds.length && i === config.rounds.length - 1
}

// ── Round titles, results flags, and sections (groups) ─────────────────────
// A round can carry a custom name (shown instead of "Round N"), be kept off the
// final results, suppress its between-round standings, and belong to a named
// section. All additive metadata on RoundInstance; absent = the defaults.
function roundTitle(round: RoundInstance, i: number): string {
  return round.name?.trim() || `Round ${i + 1}`
}
function setRoundName(i: number, name: string) {
  const r = config.rounds[i]
  if (!r) return
  if (name.trim()) r.name = name
  else delete r.name
}
function setRoundFlag(i: number, key: 'inResults' | 'showStandings', on: boolean) {
  const r = config.rounds[i]
  if (!r) return
  // Store only the non-default (false); a missing flag means "on", keeping configs small.
  if (on) delete r[key]
  else r[key] = false
}

const groups = computed<GroupDef[]>(() => config.groups ?? [])
function groupById(id?: string): GroupDef | undefined {
  return id ? groups.value.find((g) => g.id === id) : undefined
}
function createGroup(): string {
  if (!config.groups) config.groups = []
  const id = `grp_${Math.random().toString(36).slice(2, 8)}`
  config.groups.push({ id, name: `Section ${config.groups.length + 1}` })
  return id
}
function setRoundGroup(i: number, id: string) {
  const r = config.rounds[i]
  if (!r) return
  if (id === '__new__') r.group = createGroup()
  else if (id) r.group = id
  else delete r.group
  pruneGroups()
}
function renameGroup(id: string, name: string) {
  const g = groupById(id)
  if (g) g.name = name
}
function toggleCombine(id: string, on: boolean) {
  const g = groupById(id)
  if (!g) return
  if (on) g.combineRatings = true
  else delete g.combineRatings
}
// Drop any group no round references anymore (keeps the config tidy after moves/removes).
function pruneGroups() {
  if (!config.groups) return
  const used = new Set(config.rounds.map((r) => r.group).filter(Boolean))
  config.groups = config.groups.filter((g) => used.has(g.id))
  if (!config.groups.length) delete config.groups
}
// "Add section": start a new named section on the selected round so its header shows
// at once; the author renames it on the header and drags more rounds into it. A
// section needs at least one round to anchor it (an empty group wouldn't render).
function addSection() {
  if (!config.rounds.length) return
  const i = Math.min(selected.value, config.rounds.length - 1)
  setRoundGroup(i, '__new__')
  selected.value = i
}
// Does this game have any rate rounds? (combine-ratings only makes sense then.)
const hasRateRounds = computed(() => config.rounds.some((r) => r.block === 'rate'))

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
## draw   - players sketch it. Fields: prompt, timer. Add "vote: true" to make it draw-then-vote: the room draws, then votes on the gallery and the best drawing wins.

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
    // Carry imported content decks (the rounds' draw/bind/pool reference them);
    // undefined clears any decks from a previous import.
    config.decks = parsed.decks
    clearPreviews()
    selected.value = 0
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
// Escape closes the topmost transient surface (overlay, drawer, or menu), the
// standard dismissal a keyboard user expects from a modal.
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (showAdd.value) showAdd.value = false
  else if (showImport.value) showImport.value = false
  else if (showCover.value) showCover.value = false
  else if (showPreviewDrawer.value) showPreviewDrawer.value = false
}
onMounted(() => {
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onKeydown)
})
onScopeDispose(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main>
    <div class="wrap editor">
      <!-- Sticky top bar: title (left) + a compact actions cluster (right). -->
      <header class="ed-bar">
        <div class="ed-bar-title">
          <span class="kicker">{{ headerLabel }} · {{ plugin.manifest.name }}</span>
          <input v-model="config.title" class="ed-title" placeholder="Game title" aria-label="Game title" />
          <div class="ed-meta-row">
            <div class="ed-cover">
              <button
                type="button"
                class="ed-cover-btn"
                :class="{ set: !!coverImage }"
                :aria-expanded="showCover"
                :title="coverImage ? 'Change cover image' : 'Add a cover image'"
                aria-label="Cover image"
                @click="showCover = !showCover"
              >
                <img v-if="coverImage" :src="coverImage" alt="" />
                <svg v-else viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 15l-5-4-9 8" /></svg>
              </button>
              <div v-if="showCover" class="ed-cover-pop">
                <ImageField label="Cover image" :model-value="coverImage" @update:model-value="coverImage = $event" />
              </div>
              <button v-if="showCover" type="button" class="ed-pop-scrim" aria-hidden="true" tabindex="-1" @click="showCover = false" />
            </div>
            <input v-model="description" class="ed-desc" maxlength="300" placeholder="Add a one-line description (shown on cards)" aria-label="Game description" />
          </div>
          <input v-model="tagsText" class="ed-tags" placeholder="Tags: trivia, party, music" aria-label="Tags (comma-separated)" />
        </div>
        <div class="ed-bar-actions">
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
          <select v-model="visibility" class="sf-select ed-vis" aria-label="Visibility" :title="visibilityNote">
            <option value="private">Private</option>
            <option value="unlisted">Unlisted (link only)</option>
            <option value="public">Public (listed)</option>
          </select>
          <label class="ed-remix" title="Let others remix (copy) this game to make their own version">
            <input type="checkbox" v-model="forkable" />
            <span>Remixable</span>
          </label>
          <button type="button" class="ed-toggle" :class="{ on: showImport }" aria-label="Import a game from text" @click="showImport = true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
            Import
          </button>
          <button class="btn btn-ghost" :disabled="!valid || saving" @click="saveGame">
            {{ saving ? 'Saving…' : !loggedIn ? 'Log in to save' : editId ? 'Save changes' : isFork ? 'Save copy' : 'Save' }}
          </button>
          <button class="btn btn-primary" :disabled="!valid" @click="hostGame">Host now →</button>
        </div>
      </header>

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

      <!-- 3-pane body: rounds rail | selected round | persistent preview. -->
      <div class="ed-body">
        <!-- LEFT: rounds navigator -->
        <nav ref="railEl" class="ed-rail" aria-label="Rounds" @dragover="autoScroll">
          <div class="ed-rail-actions">
            <button type="button" class="ed-add-btn" @click="showAdd = true">+ Add round</button>
            <button
              type="button"
              class="ed-add-btn ed-add-section"
              :disabled="!config.rounds.length"
              title="Group the selected round into a new section; drag rounds in to grow it"
              @click="addSection()"
            >
              + Add section
            </button>
          </div>
          <!-- While dragging, say exactly where the round will land. -->
          <div v-if="isDragging" class="ed-drag-hint" :class="{ into: !!dropTargetGroup }">
            <template v-if="dropTargetGroup">Drop into <strong>{{ dropTargetName }}</strong></template>
            <template v-else>Drop here, <strong>no section</strong></template>
          </div>
          <div v-if="config.rounds.length" class="ed-rail-list" role="list" @dragover="onRailDragOver" @drop="onDrop">
            <template v-for="(row, ri) in railRows" :key="ri">
              <!-- A loose round (not in any section). -->
              <RailRound
                v-if="row.type === 'loose'"
                :block="row.round.block"
                :title="roundTitle(row.round, row.index)"
                :kind="blockFor(row.round)?.name ?? row.round.block"
                :summary="summaryOf(row.round)"
                :accent="blockColor(row.round)"
                :index="row.index"
                :total="config.rounds.length"
                :selected="selected === row.index"
                :error="errors[row.index]"
                :dragging="dragIndex === row.index"
                :drop-above="dropAboveAt(row.index)"
                :drop-below="dropBelowAt(row.index)"
                @select="select(row.index)"
                @move-up="moveRound(row.index, -1)"
                @move-down="moveRound(row.index, 1)"
                @remove="removeRound(row.index)"
                @dragstart="onDragStart(row.index, $event)"
                @dragover="onDragOver(row.index, $event)"
                @drop="onDrop($event)"
                @dragend="endDrag"
              />
              <!-- A section: a visible box you can drag rounds into and out of. -->
              <div
                v-else
                class="ed-section"
                :class="{ 'drop-into': isDragging && dropTargetGroup === row.group.id }"
                @dragover="onSectionDragOver(row.group.id, $event)"
                @drop="onDrop"
              >
                <div class="ed-section-head">
                  <span class="ed-section-tag">Section</span>
                  <input
                    class="ed-section-input"
                    :value="row.group.name"
                    aria-label="Section name"
                    maxlength="120"
                    placeholder="Name this section"
                    @input="renameGroup(row.group.id, ($event.target as HTMLInputElement).value)"
                  />
                </div>
                <div class="ed-section-rounds">
                  <RailRound
                    v-for="item in row.items"
                    :key="item.index"
                    :block="item.round.block"
                    :title="roundTitle(item.round, item.index)"
                    :kind="blockFor(item.round)?.name ?? item.round.block"
                    :summary="summaryOf(item.round)"
                    :accent="blockColor(item.round)"
                    :index="item.index"
                    :total="config.rounds.length"
                    :selected="selected === item.index"
                    :error="errors[item.index]"
                    :dragging="dragIndex === item.index"
                    :drop-above="dropAboveAt(item.index)"
                    :drop-below="dropBelowAt(item.index)"
                    @select="select(item.index)"
                    @move-up="moveRound(item.index, -1)"
                    @move-down="moveRound(item.index, 1)"
                    @remove="removeRound(item.index)"
                    @dragstart="onDragStart(item.index, $event)"
                    @dragover="onDragOver(item.index, $event)"
                    @drop="onDrop($event)"
                    @dragend="endDrag"
                  />
                </div>
              </div>
            </template>
          </div>
          <p v-else class="ed-rail-empty">No rounds yet. Add one to begin.</p>

          <!-- Content decks: paste a spreadsheet of rows, then pull fields into rounds. -->
          <details class="ed-decks-disc">
            <summary class="ed-decks-summary">
              Decks<span v-if="deckCount" class="ed-decks-count">{{ deckCount }}</span>
            </summary>
            <DeckManager :model-value="config.decks" :ref-decks="refDecks" @update:model-value="config.decks = $event" />
          </details>

          <!-- Game settings: authored play defaults (host can still override) + results order. -->
          <details class="ed-decks-disc ed-settings-disc">
            <summary class="ed-decks-summary">Game settings</summary>
            <GameSettingsPanel :model-value="config.settings" @update:model-value="config.settings = $event" />
          </details>
        </nav>

        <!-- CENTER: the selected round's form -->
        <section class="ed-center">
          <!-- A pool-fed flagship plays its attached deck, not these rounds. Make that clear. -->
          <div v-if="poolDeck" class="ed-pool-note">
            <strong>This game plays your deck{{ poolDeck.name ? ` "${poolDeck.name}"` : '' }}{{ poolDeck.rows ? ` (${poolDeck.rows} rows)` : '' }}.</strong>
            The host shuffles it and picks how many to play, so the round below is just a preview, not what plays.
            To change the content, <NuxtLink v-if="poolDeck.ref" :to="`/decks/${poolDeck.ref}`" class="ed-pool-link">edit or copy the deck</NuxtLink><span v-else>edit the deck</span>.
          </div>
          <template v-if="cur">
            <div class="ed-center-head" :style="{ '--round-accent': blockColor(cur) }">
              <GameTypeIcon :type="cur.block" :size="30" />
              <div class="ed-center-head-main">
                <span class="ed-chip-kind">{{ blockFor(cur)?.name ?? cur.block }}</span>
                <input
                  class="ed-center-title-input"
                  :value="cur.name ?? ''"
                  :placeholder="`Round ${selected + 1}`"
                  aria-label="Round title"
                  maxlength="120"
                  @input="setRoundName(selected, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </div>
            <!-- Judge rounds (Vote/Split/...) build their content from the prior
                 round at runtime; explain it instead of showing empty fields. -->
            <div v-if="isDerived(cur)" class="ed-derived" :class="{ bad: errors[selected] }">
              <svg class="ed-derived-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8" /></svg>
              <div class="ed-derived-body" v-if="sourceIndexFor(selected) !== null">
                <strong>Built automatically from Round {{ sourceIndexFor(selected)! + 1 }}.</strong>
                <p>
                  You don't fill in the {{ derivedNoun(cur) }} here. Whatever players write in
                  Round {{ sourceIndexFor(selected)! + 1 }} ({{ sourceName(selected) }}) becomes the answers
                  everyone votes on, shuffled and anonymized. You fill in the prompt, timer, and any other fields below.
                </p>
              </div>
              <div class="ed-derived-body" v-else>
                <strong>This round needs a writing round before it.</strong>
                <p>
                  A {{ blockFor(cur)?.name }} round builds its {{ derivedNoun(cur) }} from the answers
                  collected in the round right above it. Add a Quip or Fill round before this one.
                </p>
              </div>
            </div>
            <SchemaForm
              v-if="blockFor(cur)"
              :schema="blockFor(cur)!.contentSchema"
              :hide="derivedFieldsOf(cur)"
              :model-value="contentOf(cur)"
              @update:model-value="onContentUpdate(selected, $event)"
            />
            <p v-if="errors[selected]" class="sf-error" role="alert">{{ errors[selected] }}</p>
            <!-- Pull a round's fields from a content deck (drawn fresh each play). -->
            <div v-if="!isDerived(cur)" class="ed-bind">
              <span class="ed-bind-label">Pull from a deck</span>
              <RoundBindings :round="cur" :block="blockFor(cur)" :decks="config.decks" :ref-columns="refColumns" @change="onBindingsChange(selected, $event)" />
            </div>
            <div v-if="shareSource !== null" class="ed-bind">
              <span class="ed-bind-label">Shared photo</span>
              <label class="ed-share">
                <input type="checkbox" :checked="usesShare" @change="toggleShare(($event.target as HTMLInputElement).checked)" />
                <span>Use a photo shared in round {{ shareSource + 1 }}. A random one fills this round's image when you reach it.</span>
              </label>
            </div>

            <!-- Round options: results visibility, standings, and the section it belongs to. -->
            <RoundOptions
              :round="cur"
              :groups="groups"
              :is-display="curIsDisplay"
              :has-rate-rounds="hasRateRounds"
              @set-flag="setRoundFlag(selected, $event.key, $event.on)"
              @set-group="setRoundGroup(selected, $event)"
              @rename-group="renameGroup($event.id, $event.name)"
              @toggle-combine="toggleCombine($event.id, $event.on)"
            />
          </template>
          <div v-else class="ed-empty">
            <GameTypeIcon type="custom" :size="46" />
            <h2>Add your first round</h2>
            <p>Pick a single round, or a two-phase recipe like Write &amp; Vote, from the Add panel.</p>
            <button type="button" class="btn btn-primary" @click="showAdd = true">+ Add round</button>
          </div>
        </section>

        <!-- RIGHT: persistent preview (a drawer below ~1000px). -->
        <aside class="ed-preview-pane" :class="{ open: showPreviewDrawer }" aria-label="Round preview">
          <div class="ed-preview-bar">
            <div class="ed-preview-head" role="group" aria-label="Preview surface">
              <button type="button" class="ed-pt-btn" :class="{ on: previewMode === 'phone' }" :aria-pressed="previewMode === 'phone'" @click="previewMode = 'phone'">Phone</button>
              <button type="button" class="ed-pt-btn" :class="{ on: previewMode === 'host' }" :aria-pressed="previewMode === 'host'" @click="previewMode = 'host'">Big screen</button>
            </div>
            <div v-if="canPreviewReveal" class="ed-preview-head" role="group" aria-label="Preview moment">
              <button type="button" class="ed-pt-btn" :class="{ on: previewState === 'open' }" :aria-pressed="previewState === 'open'" @click="previewState = 'open'">Answering</button>
              <button type="button" class="ed-pt-btn" :class="{ on: previewState === 'reveal' }" :aria-pressed="previewState === 'reveal'" @click="previewState = 'reveal'">Reveal</button>
            </div>
            <button type="button" class="ed-drawer-close" aria-label="Close preview" @click="showPreviewDrawer = false">✕</button>
          </div>

          <template v-if="cur">
            <div ref="previewSurface" class="ed-preview-surface">
              <!-- PHONE: a real phone-width device frame. -->
              <div v-if="previewMode === 'phone'" class="ed-phone-device">
                <div class="ed-phone-screen">
                  <div class="ed-phone">
                    <template v-if="!curIsDisplay">
                      <div class="kicker">{{ blockFor(cur)?.name }}</div>
                      <h3 class="ed-phone-prompt">{{ previewPrompt || promptOf(cur) }}</h3>
                      <img v-if="previewContent.image" :src="previewContent.image as string" alt="" class="ed-phone-img" />
                      <p v-if="previewContent.audio" class="ed-audio-hint">Listen to the big screen</p>
                    </template>
                    <template v-if="isDerived(cur)">
                      <p class="ed-preview-hint">Filled in live from the previous round, for example:</p>
                      <ul class="ed-sample">
                        <li>An answer a player wrote</li>
                        <li>Another player's answer</li>
                        <li>A third answer</li>
                      </ul>
                    </template>
                    <PlayerPreview
                      v-else-if="blockFor(cur) && !errors[selected]"
                      :block="blockFor(cur)!"
                      :content="previewContent"
                      :model-value="previewValue(selected)"
                      :state="previewState"
                      @update:model-value="previewInputs[selected] = $event"
                    />
                    <p v-else class="ed-preview-hint">Preview appears once this round is valid.</p>
                  </div>
                </div>
                <p class="ed-device-label">Phone · 390px</p>
              </div>

              <!-- BIG SCREEN: a 16:9 screen, the real host stage scaled to fit. -->
              <div v-else class="ed-screen-device">
                <div class="ed-screen-stage" :style="{ transform: `scale(${bsScale})` }" inert>
                  <!-- Display block (slide / title): owns the whole stage, like the host. -->
                  <div v-if="curIsDisplay && blockFor(cur) && !errors[selected]" class="ed-bs-full">
                    <HostPreview :block="blockFor(cur)!" :content="previewContent" :index="selected" :state="previewState" />
                  </div>
                  <!-- Derived (judge) round: built live from the previous round. -->
                  <div v-else-if="isDerived(cur)" class="ed-bs-full">
                    <p class="ed-bs-derived">The big screen fills in live from the previous round.</p>
                  </div>
                  <!-- Normal round: prompt/image on the left, the board on the right (the
                       real GameHost split stage). -->
                  <div v-else-if="blockFor(cur) && !errors[selected]" class="ed-bs-grid">
                    <div class="ed-bs-left">
                      <h3 class="ed-bs-prompt">{{ previewPrompt || promptOf(cur) }}</h3>
                      <img v-if="previewContent.image" :src="previewContent.image as string" alt="" class="ed-bs-img" />
                      <AudioClip v-if="previewContent.audio" :src="previewContent.audio as string" class="ed-bs-audio" :label="previewPrompt || 'Listen'" />
                    </div>
                    <div class="ed-bs-right">
                      <HostPreview :block="blockFor(cur)!" :content="previewContent" :index="selected" :state="previewState" />
                    </div>
                  </div>
                  <div v-else class="ed-bs-full"><p class="ed-bs-derived">Preview appears once this round is valid.</p></div>
                </div>
                <p class="ed-device-label">Big screen · 16:9</p>
              </div>
            </div>
          </template>
          <p v-else class="ed-preview-hint">Add a round to see a preview.</p>
        </aside>
        <button v-if="showPreviewDrawer" type="button" class="ed-drawer-scrim" aria-label="Close preview" @click="showPreviewDrawer = false" />
      </div>

      <!-- Narrow-screen floating button to open the preview drawer. -->
      <button v-if="cur" type="button" class="ed-preview-fab" @click="showPreviewDrawer = true">Preview</button>

      <!-- ── Overlays ──────────────────────────────────────────────────── -->

      <!-- Add panel: Single rounds + Two-phase recipes -->
      <div v-if="showAdd" class="ed-overlay" @click.self="showAdd = false">
        <div class="ed-sheet" role="dialog" aria-label="Add a round" aria-modal="true">
          <div class="ed-sheet-head">
            <h2>Add a round</h2>
            <button type="button" class="ed-drawer-close" aria-label="Close" @click="showAdd = false">✕</button>
          </div>
          <div class="ed-sheet-body">
            <h3 class="ed-sheet-sub">Single rounds</h3>
            <div class="ed-add-grid">
              <button
                v-for="b in singleBlocks"
                :key="b.kind"
                type="button"
                class="ed-add-card"
                :style="{ '--round-accent': gameVisual(b.kind).color }"
                @click="addSingle(b.kind)"
              >
                <GameTypeIcon :type="b.kind" :size="30" />
                <span class="ed-add-name">{{ b.name }}</span>
                <span class="ed-add-desc">{{ singleDesc(b.kind) }}</span>
              </button>
            </div>

            <template v-if="recipes.length">
              <h3 class="ed-sheet-sub">Two-phase recipes</h3>
              <p class="ed-sheet-note">Each one adds a writing round plus the judging round built from it, in one click.</p>
              <div class="ed-add-grid">
                <button
                  v-for="r in recipes"
                  :key="r.id"
                  type="button"
                  class="ed-add-card"
                  :style="{ '--round-accent': gameVisual(r.make).color }"
                  @click="addRecipe(r)"
                >
                  <GameTypeIcon :type="r.make" :size="30" />
                  <span class="ed-add-name">{{ r.name }}</span>
                  <span class="ed-add-pair">{{ kindName(r.make) }} + {{ kindName(r.judge) }}</span>
                  <span class="ed-add-desc">{{ r.description }}</span>
                </button>
              </div>
            </template>

            <p class="ed-sheet-foot">
              Looking for Bars, Spotlight, or the Cellar quiz? Those blocks are built into their flagship
              games (Circuit Cypher, Truth or Share, Quiz or Die) and run their own flow, so they are not
              standalone rounds you add here.
            </p>
          </div>
        </div>
      </div>

      <!-- Import overlay -->
      <div v-if="showImport" class="ed-overlay" @click.self="showImport = false">
        <div class="ed-sheet" role="dialog" aria-label="Import from text" aria-modal="true">
          <div class="ed-sheet-head">
            <h2>Import from text</h2>
            <button type="button" class="ed-drawer-close" aria-label="Close" @click="showImport = false">✕</button>
          </div>
          <div class="ed-sheet-body ed-import">
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
                  <li><b>draw</b>: players sketch the prompt. Add <code>vote: true</code> to draw then vote on the gallery (best drawing wins).</li>
                </ul>
                <p class="ed-import-tip">
                  Unknown lines are ignored; rounds that need attention are flagged below once imported.
                </p>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.editor {
  /* padding-bottom only, so the global .wrap's horizontal padding (which aligns
     the editor with the site nav) is preserved. */
  padding-bottom: 60px;
}
/* ── Sticky top bar ─────────────────────────────────────────────────────── */
.ed-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 16px 0 12px;
  margin-bottom: 12px;
  background: var(--bg);
  border-bottom: var(--bd) solid var(--line-soft);
}
.ed-bar-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 260px;
}
.ed-title {
  display: block;
  font-size: clamp(20px, 2.4vw, 30px);
  font-weight: 800;
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--line-soft);
  color: var(--ink);
  padding: 3px 2px;
  width: min(520px, 100%);
  font-family: inherit;
}
.ed-title:focus {
  outline: none;
  border-bottom-color: var(--primary);
}
/* Description row: a small cover-image button + the one-line description. */
.ed-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  width: min(520px, 100%);
}
.ed-cover {
  position: relative;
  flex: none;
}
.ed-cover-btn {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: var(--bd) solid var(--line-soft);
  border-radius: 9px;
  background: var(--surface);
  color: var(--ink-soft);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.12s;
}
.ed-cover-btn:hover {
  border-color: var(--line);
}
.ed-cover-btn.set {
  border-color: var(--primary);
}
.ed-cover-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ed-cover-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ed-cover-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 300px;
  max-width: 80vw;
  padding: 12px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 12px;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.2);
}
.ed-pop-scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: transparent;
  border: none;
  cursor: default;
}
.ed-desc {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: var(--ink-soft);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  padding: 4px 2px;
  font-family: inherit;
}
.ed-desc::placeholder,
.ed-tags::placeholder {
  color: var(--mute);
}
.ed-desc:focus,
.ed-tags:focus {
  outline: none;
  color: var(--ink);
  border-bottom-color: var(--line-soft);
}
.ed-tags {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--ink-soft);
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  padding: 3px 2px;
  width: min(520px, 100%);
  font-family: inherit;
}
.ed-bar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ed-vis {
  width: auto;
  min-width: 130px;
}
/* "Remixable" checkbox, sized to match the visibility picker next to it. */
.ed-remix {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
  padding: 0 13px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  background: var(--surface);
  color: var(--ink);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.ed-remix input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--primary);
}
.ed-swatches {
  display: flex;
  gap: 6px;
  align-items: center;
}
.ed-swatch {
  width: 24px;
  height: 24px;
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
/* Import button in the top bar (an icon + label that opens the Import overlay). */
.ed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 40px;
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
.ed-note {
  color: var(--ink-soft);
  font-size: 14px;
  margin: 0 0 16px;
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
/* ── 3-pane body ────────────────────────────────────────────────────────── */
.ed-body {
  display: grid;
  grid-template-columns: 264px minmax(0, 1fr) clamp(360px, 32vw, 460px);
  gap: 20px;
  align-items: start;
}
/* LEFT: rounds navigator */
.ed-rail {
  position: sticky;
  top: 84px;
  align-self: start;
  max-height: calc(100vh - 100px);
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.ed-rail-actions {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
}
.ed-add-btn {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-weight: 800;
  font-size: 14px;
  color: var(--primary-ink);
  background: var(--primary);
  border: none;
  border-radius: 12px;
  padding: 11px 14px;
  cursor: pointer;
}
.ed-add-btn:hover {
  filter: brightness(1.05);
}
/* "Add section" is the secondary action next to the primary "Add round". */
.ed-add-section {
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
}
.ed-add-section:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ed-add-section:not(:disabled):hover {
  border-color: var(--line);
  filter: none;
}
.ed-rail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* A live "here's where it'll land" banner while dragging. */
.ed-drag-hint {
  position: sticky;
  top: 0;
  z-index: 3;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--surface-2);
  border: var(--bd) dashed var(--line);
  border-radius: 10px;
  padding: 7px 10px;
}
.ed-drag-hint.into {
  color: var(--primary);
  border-color: var(--primary);
  border-style: solid;
}
.ed-drag-hint strong {
  font-weight: 800;
}
/* A section is a visible container: a tinted, bordered box that holds its rounds,
   with an editable name. Dragging a round over it highlights it (you'll drop INTO
   this section); dragging out to the gutter drops the round loose. */
.ed-section {
  border: var(--bd) solid color-mix(in srgb, var(--primary) 35%, var(--line-soft));
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
}
.ed-section.drop-into {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, var(--surface));
  box-shadow: 0 0 0 2px var(--primary);
}
.ed-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 0;
}
.ed-section-tag {
  flex: none;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  border-radius: 999px;
  padding: 2px 8px;
}
.ed-section-input {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
  background: transparent;
  border: var(--bd) solid transparent;
  border-radius: 7px;
  padding: 3px 6px;
}
.ed-section-input::placeholder {
  color: var(--ink-soft);
  opacity: 0.7;
}
.ed-section-input:hover {
  border-color: var(--line-soft);
}
.ed-section-input:focus {
  outline: none;
  border-color: var(--primary);
  background: var(--surface);
}
.ed-section-rounds {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ed-rail-empty {
  color: var(--ink-soft);
  font-size: 14px;
  padding: 8px 4px;
}
.ed-decks-disc {
  margin-top: 14px;
  border-top: var(--bd) solid var(--line-soft);
  padding-top: 12px;
}
.ed-decks-summary {
  cursor: pointer;
  font-weight: 800;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  list-style: revert;
  margin-bottom: 10px;
}
.ed-decks-count {
  margin-left: 8px;
  background: var(--surface-2);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
}
.ed-bind {
  margin-top: 16px;
  border-top: var(--bd) solid var(--line-soft);
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ed-bind-label {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--primary);
}
.ed-share {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--ink);
  line-height: 1.4;
  cursor: pointer;
}
.ed-share input {
  margin-top: 2px;
}
/* CENTER: the selected round's form */
.ed-center {
  min-width: 0;
}
.ed-pool-note {
  background: var(--surface-2);
  border: var(--bd) solid var(--c3);
  border-radius: var(--radius);
  padding: 12px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ink-soft);
}
.ed-pool-note strong { color: var(--ink); }
.ed-pool-link { color: var(--primary); font-weight: 700; }
.ed-center-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}
.ed-center-title {
  font-size: 22px;
  font-weight: 800;
  margin: 2px 0 0;
}
.ed-center-head-main {
  flex: 1;
  min-width: 0;
}
/* The round title is editable inline (click to retitle); it reads like a heading
   until focused, then shows it's a field. */
.ed-center-title-input {
  width: 100%;
  font-size: 22px;
  font-weight: 800;
  margin: 2px 0 0;
  border: var(--bd) solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  padding: 2px 8px;
  margin-left: -8px;
}
.ed-center-title-input::placeholder {
  color: var(--ink);
  opacity: 1;
}
.ed-center-title-input:hover {
  border-color: var(--line-soft);
}
.ed-center-title-input:focus {
  outline: none;
  border-color: var(--primary);
  background: var(--surface);
}
.ed-empty {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 10px;
  padding: 60px 20px;
  border: var(--bd) dashed var(--line-soft);
  border-radius: 16px;
  color: var(--ink-soft);
}
.ed-empty h2 {
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
  margin: 0;
}
.ed-empty p {
  max-width: 42ch;
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.5;
}
/* RIGHT: persistent preview (a drawer below ~1000px) */
.ed-preview-pane {
  position: sticky;
  top: 84px;
  align-self: start;
  max-height: calc(100vh - 100px);
  overflow: auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ed-preview-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ed-drawer-close {
  font: inherit;
  font-size: 16px;
  line-height: 1;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 9px;
  width: 32px;
  height: 32px;
  cursor: pointer;
}
.ed-preview-bar .ed-drawer-close {
  display: none;
}
.ed-drawer-scrim {
  display: none;
}
.ed-preview-fab {
  display: none;
}
/* Preview surface toggle: phone vs the big screen. */
.ed-preview-head {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
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
.ed-preview-hint {
  font-size: 14px;
  color: var(--ink-soft);
  font-weight: 500;
}
.ed-preview-surface {
  min-width: 0;
}
.ed-device-label {
  margin-top: 8px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mute);
}
/* PHONE: a real phone-width device with a dark bezel; the player view renders at its
   true width and scrolls inside like an actual phone. */
.ed-phone-device {
  width: min(390px, 100%);
  margin: 0 auto;
  background: #0e0e13;
  border-radius: 38px;
  padding: 11px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28), inset 0 0 0 2px #2b2b34;
}
.ed-phone-screen {
  background: var(--surface);
  border-radius: 28px;
  overflow: hidden auto;
  max-height: calc(100vh - 240px);
}
.ed-phone {
  padding: 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.ed-audio-hint {
  margin-top: 8px;
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-soft);
}
/* BIG SCREEN: a 16:9 monitor frame; the real host stage is rendered at 1280x720 and
   transform-scaled to fit, so the layout + proportions read like an actual TV. */
.ed-screen-device {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border: 7px solid #15151b;
  border-radius: 14px;
  overflow: hidden;
  position: relative;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}
.ed-screen-stage {
  position: absolute;
  top: 0;
  left: 0;
  width: 1280px;
  height: 720px;
  transform-origin: top left;
  box-sizing: border-box;
  padding: 40px 44px;
  display: flex;
  background: var(--surface);
  pointer-events: none;
}
.ed-bs-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  align-items: stretch;
}
.ed-bs-left,
.ed-bs-right {
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 16px;
}
.ed-bs-full {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ed-bs-prompt {
  font-family: var(--font-display, inherit);
  font-size: clamp(30px, 3.4vw, 50px);
  font-weight: 800;
  line-height: 1.12;
  margin: 0;
}
.ed-bs-img {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: var(--radius-lg, 16px);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
}
.ed-bs-audio {
  margin-top: 6px;
  max-width: 520px;
}
.ed-bs-derived {
  font-size: 24px;
  color: var(--ink-soft);
  font-weight: 600;
  text-align: center;
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
/* ── Overlays (Add panel, Import) ───────────────────────────────────────── */
/* z-index sits above the global .topbar (z-index 500) so a modal is never
   clipped behind the site header. */
.ed-overlay {
  position: fixed;
  inset: 0;
  z-index: 600;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: max(24px, 5vh) 16px 24px;
  background: rgba(0, 0, 0, 0.42);
  overflow: auto;
}
.ed-sheet {
  width: min(720px, 100%);
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 18px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.3);
}
.ed-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: var(--bd) solid var(--line-soft);
}
.ed-sheet-head h2 {
  font-size: 19px;
  font-weight: 800;
  margin: 0;
}
.ed-sheet-body {
  padding: 18px;
}
.ed-sheet-sub {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin: 0 0 10px;
}
.ed-sheet-sub:not(:first-child) {
  margin-top: 22px;
}
.ed-sheet-note {
  font-size: 13px;
  color: var(--ink-soft);
  margin: -4px 0 12px;
}
.ed-add-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}
.ed-add-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 14px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-left: 4px solid var(--round-accent, var(--line-soft));
  border-radius: 13px;
  cursor: pointer;
  font-family: inherit;
  color: var(--ink);
  transition: border-color 0.12s, transform 0.08s;
}
.ed-add-card:hover {
  border-color: var(--ink);
  transform: translateY(-1px);
}
.ed-add-name {
  font-weight: 800;
  font-size: 15px;
  margin-top: 4px;
}
.ed-add-pair {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--mute);
}
.ed-add-desc {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.4;
}
.ed-sheet-foot {
  font-size: 12px;
  color: var(--mute);
  line-height: 1.5;
  margin: 18px 0 0;
  padding-top: 12px;
  border-top: var(--bd) solid var(--line-soft);
}
/* ── Two-phase "built automatically" explainer ──────────────────────────── */
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
/* ── Responsive: collapse to one column, preview behind a drawer ─────────── */
@media (max-width: 1000px) {
  .ed-body {
    grid-template-columns: 1fr;
  }
  .ed-rail {
    position: static;
    max-height: none;
    overflow: visible;
  }
  /* The preview becomes a right-side drawer; a FAB opens it. All three sit
     above the global .topbar (z-index 500). */
  .ed-preview-pane {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 620;
    width: min(420px, 92vw);
    max-height: none;
    padding: 16px;
    background: var(--bg);
    border-left: var(--bd) solid var(--line-soft);
    box-shadow: -16px 0 48px rgba(0, 0, 0, 0.28);
    transform: translateX(100%);
    transition: transform 0.2s ease;
  }
  .ed-preview-pane.open {
    transform: translateX(0);
  }
  .ed-preview-bar .ed-drawer-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .ed-drawer-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 610;
    background: rgba(0, 0, 0, 0.42);
    border: none;
  }
  .ed-preview-fab {
    display: inline-flex;
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 590;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-weight: 800;
    font-size: 14px;
    color: var(--primary-ink);
    background: var(--primary);
    border: none;
    border-radius: 999px;
    padding: 12px 20px;
    cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  }
}
@media (max-width: 640px) {
  .ed-bar {
    align-items: stretch;
  }
  .ed-bar-actions {
    width: 100%;
  }
  .ed-bar-actions .btn {
    flex: 1 1 auto;
  }
}
</style>
