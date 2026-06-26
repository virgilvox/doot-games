<script setup lang="ts">
/**
 * Phone for the solo Tier List block: the host drives the item-by-item show; this
 * shows the CURRENT item big and a stack of full-width tier buttons. One tap places
 * it; re-tap to change freely until the host reveals that item (no early lock). Votes
 * go through the STANDARD round input (room.submit of the growing placements map), so
 * the normal aggregate scores it — the relay's `/x/tiershow` only syncs which item.
 *
 * With no live room (the editor preview) it falls back to item 0, so the preview shows
 * the real one-item-at-a-time experience.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import { computed, onMounted, ref } from 'vue'
import type { TierContent, TierInput } from './block'
import { DEFAULT_TIERS, textOn } from './logic'
import type { TierShow } from './show'

const props = defineProps<{ content: TierContent; modelValue?: TierInput }>()
const emit = defineEmits<{ 'update:modelValue': [value: TierInput] }>()
const room = injectDootRoom()

const show = ref<TierShow | null>(null)
onMounted(() => {
  room.onExtra('tiershow', (v) => {
    show.value = (v as TierShow | null) ?? null
  })
})

const tiers = computed(() => props.content.tiers ?? DEFAULT_TIERS)
const items = computed(() => props.content.items ?? [])
const index = computed(() => Math.min(show.value?.index ?? 0, Math.max(0, items.value.length - 1)))
const item = computed(() => items.value[index.value] ?? null)
const phase = computed(() => show.value?.phase ?? 'voting')
const placements = computed(() => props.modelValue?.placements ?? {})
const myTier = computed(() => (item.value ? placements.value[item.value.id] : undefined))

function colorOf(i: number): string {
  return tiers.value[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function vote(tier: number) {
  if (phase.value === 'reveal' || !item.value) return // locked once the host reveals
  const next: TierInput = { placements: { ...placements.value, [item.value.id]: tier } }
  emit('update:modelValue', next)
  room.submit(next as never)
}
</script>

<template>
  <div class="tl-player">
    <template v-if="item">
      <p class="tl-prompt">{{ content.prompt || 'Where does it go?' }}</p>
      <img v-if="item.image" :src="item.image" alt="" class="tl-img" />
      <h1 class="tl-name" :class="{ 'no-img': !item.image }">{{ item.label }}</h1>

      <div v-if="phase === 'reveal'" class="tl-locked">
        <span v-if="myTier != null" class="tl-yourpick" :style="{ '--tc': colorOf(myTier), '--tt': textOn(colorOf(myTier)) }">You said {{ tiers[myTier]?.label }}</span>
        <h2>Locked in</h2>
        <p>Watch the big screen — it's landing now.</p>
      </div>
      <div v-else class="tl-tiers" role="group" :aria-label="`Tier for ${item.label}`">
        <button
          v-for="(t, ti) in tiers"
          :key="ti"
          type="button"
          class="tl-tier"
          :class="{ on: myTier === ti }"
          :style="{ '--tc': colorOf(ti), '--tt': textOn(colorOf(ti)) }"
          :aria-pressed="myTier === ti"
          @click="vote(ti)"
        >
          <span class="tl-letter">{{ t.label }}</span>
          <span v-if="t.sublabel" class="tl-sub">{{ t.sublabel }}</span>
        </button>
      </div>
      <p v-if="phase !== 'reveal'" class="tl-hint">Tap a tier — you can change it until it locks.</p>
    </template>
    <div v-else class="tl-locked"><h2>Get ready</h2><p>The first item is coming up.</p></div>
  </div>
</template>

<style scoped>
.tl-player {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.tl-prompt {
  text-align: center;
  color: var(--ink-soft);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 13px;
}
.tl-img {
  width: clamp(120px, 44vw, 190px);
  height: clamp(120px, 44vw, 190px);
  object-fit: cover;
  border-radius: 18px;
  align-self: center;
  border: var(--bd) solid var(--line-soft);
}
.tl-name {
  text-align: center;
  font-weight: 800;
  font-size: clamp(26px, 8vw, 38px);
  overflow-wrap: anywhere;
}
/* Text-only items get a bigger, bolder name (no image to carry the weight). */
.tl-name.no-img {
  font-size: clamp(30px, 10vw, 46px);
  padding: 14px 0 4px;
}
.tl-tiers {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.tl-tier {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 58px;
  padding: 0 18px;
  border-radius: 14px;
  border: none;
  background: var(--tc);
  color: var(--tt, #1a1a1a);
  cursor: pointer;
  transition: transform 0.08s, box-shadow 0.12s, outline-color 0.12s;
  outline: 3px solid transparent;
  outline-offset: 2px;
}
.tl-tier:active {
  transform: scale(0.98);
}
.tl-tier.on {
  outline-color: var(--ink);
  box-shadow: var(--shadow);
}
.tl-letter {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 26px;
  min-width: 30px;
}
.tl-sub {
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 13px;
  opacity: 0.85;
}
.tl-hint {
  text-align: center;
  color: var(--mute);
  font-size: 13px;
}
.tl-locked {
  text-align: center;
  padding: 18px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.tl-locked h2 {
  font-weight: 800;
  font-size: 22px;
}
.tl-yourpick {
  display: inline-block;
  background: var(--tc);
  color: var(--tt, #1a1a1a);
  font-weight: 800;
  border-radius: 10px;
  padding: 6px 14px;
}
@media (prefers-reduced-motion: reduce) {
  .tl-tier,
  .tl-tier:active {
    transition: none;
    transform: none;
  }
}
</style>
