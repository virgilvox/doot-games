<script setup lang="ts">
/**
 * Tier List phone (item-by-item). The host drives the show over `/x/show`; this phone
 * shows the CURRENT item big and a stack of full-width tier buttons. One tap places it
 * (and you can re-tap to change until the host closes voting). The big screen is the
 * reveal; the phone is private input only.
 *
 * In "all at once" mode every item is shown at once with its own tier row.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { computed, onMounted, ref } from 'vue'
import type { TierContent } from '../../blocks/tier/block'
import { DEFAULT_TIERS, textOn } from '../../blocks/tier/logic'
import GameResults from '../../runtime/GameResults.vue'
import type { TierShow } from './show'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const content = computed<TierContent | null>(() => (config.value?.rounds[0]?.content as TierContent) ?? null)
const tiers = computed(() => content.value?.tiers ?? DEFAULT_TIERS)
const items = computed(() => content.value?.items ?? [])
const myId = computed(() => room.me.value.id)

const show = ref<TierShow | null>(null)
// My vote per item index, so the chosen tier stays highlighted (and survives a
// reconnect-driven re-render).
const myVotes = ref<Record<number, number>>({})

onMounted(() => {
  room.onExtra('show', (v) => {
    show.value = (v as TierShow | null) ?? null
  })
})

const currentIndex = computed(() => show.value?.index ?? 0)
const currentItem = computed(() => items.value[currentIndex.value] ?? null)
const isReveal = computed(() => show.value?.phase === 'reveal')
const allAtOnce = computed(() => show.value?.mode === 'all')

function colorOf(i: number): string {
  return tiers.value[i]?.color || DEFAULT_TIERS[i % DEFAULT_TIERS.length]?.color || 'var(--primary)'
}
function vote(itemIndex: number, tier: number) {
  if (isReveal.value && !allAtOnce.value) return
  myVotes.value = { ...myVotes.value, [itemIndex]: tier }
  room.publishExtra(`vote/${itemIndex}/${myId.value}`, { tier } as unknown as RelayValue)
}
</script>

<template>
  <div class="tl-player">
    <!-- Lobby -->
    <div v-if="room.phase.value === 'lobby'" class="tl-big">
      <h2>You're in</h2>
      <p>Keep this page open. The host will start the tier list.</p>
    </div>

    <!-- Results -->
    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <!-- Waiting for the show to start -->
    <div v-else-if="!show" class="tl-big">
      <h2>Get ready</h2>
      <p>The first item is coming up.</p>
    </div>

    <!-- ALL AT ONCE: every item with its own tier row -->
    <div v-else-if="allAtOnce" class="tl-all">
      <p class="tl-allhint">Tier all {{ items.length }} — tap a band for each.</p>
      <div v-for="(item, ii) in items" :key="item.id" class="tl-allitem">
        <div class="tl-allhead">
          <img v-if="item.image" :src="item.image" alt="" class="tl-allthumb" />
          <span class="tl-alllabel">{{ item.label }}</span>
        </div>
        <div class="tl-tiers compact" role="group" :aria-label="`Tier for ${item.label}`">
          <button
            v-for="(t, ti) in tiers"
            :key="ti"
            type="button"
            class="tl-tier sm"
            :class="{ on: myVotes[ii] === ti }"
            :style="{ '--tc': colorOf(ti), '--tt': textOn(colorOf(ti)) }"
            :aria-pressed="myVotes[ii] === ti"
            @click="vote(ii, ti)"
          >
            <span class="tl-letter">{{ t.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ONE BY ONE: the current item, big, with full-width tier buttons -->
    <template v-else-if="currentItem">
      <p class="tl-prompt">{{ content?.prompt || 'Where does it go?' }}</p>
      <img v-if="currentItem.image" :src="currentItem.image" alt="" class="tl-img" />
      <h1 class="tl-name">{{ currentItem.label }}</h1>

      <div v-if="isReveal" class="tl-locked">
        <h2>Locked in</h2>
        <p>Watch the big screen — it's landing now.</p>
      </div>
      <div v-else class="tl-tiers" role="group" :aria-label="`Tier for ${currentItem.label}`">
        <button
          v-for="(t, ti) in tiers"
          :key="ti"
          type="button"
          class="tl-tier"
          :class="{ on: myVotes[currentIndex] === ti }"
          :style="{ '--tc': colorOf(ti), '--tt': textOn(colorOf(ti)) }"
          :aria-pressed="myVotes[currentIndex] === ti"
          @click="vote(currentIndex, ti)"
        >
          <span class="tl-letter">{{ t.label }}</span>
          <span v-if="t.sublabel" class="tl-sub">{{ t.sublabel }}</span>
        </button>
      </div>
    </template>

    <div v-else class="tl-big"><h2>Watch the big screen</h2></div>
  </div>
</template>

<style scoped>
.tl-player {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tl-big {
  text-align: center;
  padding: 28px 0;
}
.tl-big h2 {
  font-weight: 800;
  font-size: 22px;
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
  width: clamp(120px, 42vw, 180px);
  height: clamp(120px, 42vw, 180px);
  object-fit: cover;
  border-radius: 18px;
  align-self: center;
  border: var(--bd) solid var(--line-soft);
}
.tl-name {
  text-align: center;
  font-weight: 800;
  font-size: clamp(26px, 8vw, 36px);
  overflow-wrap: anywhere;
}
.tl-tiers {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: 4px;
}
.tl-tier {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
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
.tl-locked {
  text-align: center;
  padding: 18px 0;
}
.tl-locked h2 {
  font-weight: 800;
  font-size: 22px;
}
/* All-at-once */
.tl-allhint {
  text-align: center;
  color: var(--ink-soft);
  font-weight: 700;
}
.tl-allitem {
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
  padding: 10px;
  margin-bottom: 9px;
}
.tl-allhead {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 8px;
}
.tl-allthumb {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  object-fit: cover;
}
.tl-alllabel {
  font-weight: 800;
  font-size: 16px;
}
.tl-tiers.compact {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px;
}
.tl-tier.sm {
  flex: 1 1 0;
  min-width: 44px;
  min-height: 44px;
  justify-content: center;
  padding: 0 6px;
  border: 2px solid color-mix(in srgb, var(--tc) 50%, var(--line-soft));
  background: color-mix(in srgb, var(--tc) 12%, var(--surface-2));
  color: var(--ink);
}
.tl-tier.sm.on {
  background: var(--tc);
  color: var(--tt, #1a1a1a);
  outline-color: transparent;
}
.tl-tier.sm .tl-letter {
  font-size: 18px;
  min-width: 0;
}
@media (prefers-reduced-motion: reduce) {
  .tl-tier,
  .tl-tier:active {
    transition: none;
    transform: none;
  }
}
</style>
