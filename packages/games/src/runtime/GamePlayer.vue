<script setup lang="ts">
/**
 * Generic player surface for any block-composed game: waiting/lobby/results
 * states are shared; the open-round input delegates to the current block's
 * PlayerInput. No game writes this.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { computed, ref, watch } from 'vue'
import GameResults from './GameResults.vue'
import { getBlock } from './derive'

const props = defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(
  () => (room.config.value as unknown as GameComposition) ?? null,
)
const rounds = computed(() => config.value?.rounds ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
const instance = computed(() => rounds.value[index.value] ?? null)
const block = computed(() =>
  instance.value ? getBlock(props.plugin, instance.value.block) : undefined,
)
// A two-phase round's content (the vote options) arrives at runtime via the
// relay; overlay it on the authored content when present.
const content = computed(() => room.runtimeContentFor(index.value) ?? instance.value?.content ?? null)
const prompt = computed(() => (content.value as { prompt?: string } | null)?.prompt ?? '')
// Show the prompt image on the phone too (not only the host screen), so players
// who can't see the big screen still get the question. Hide it if it 404s.
const image = computed(() => (content.value as { image?: string } | null)?.image ?? '')
const failedImage = ref(false)
watch(image, () => {
  failedImage.value = false
})
const showImage = computed(() => !!image.value && !failedImage.value)
const submitted = computed(() => room.inputFor(index.value) !== undefined)
const eligible = computed(() => index.value >= room.joinedAtIndex.value)

const value = ref<unknown>(null)
// Re-initialize when the round changes AND when the block/content first become
// available, relay messages arrive in separate emits and any order, so content
// can land after the round is already 'open' without changing index/state.
watch(
  () => `${index.value}:${state.value}:${block.value?.kind ?? ''}:${content.value ? 1 : 0}`,
  () => {
    value.value = block.value && content.value ? block.value.emptyInput(content.value) : null
  },
  { immediate: true },
)
const canSubmit = computed(() => {
  if (!block.value || !content.value) return false
  // Don't accept a submission while the host is gone, it can't be tallied.
  if (!room.hostPresent.value) return false
  return block.value.isComplete ? block.value.isComplete(content.value, value.value) : true
})
function submit() {
  if (!canSubmit.value) return
  room.submit(value.value as never)
}

// The config names this round's block, but this client doesn't have it. That
// almost always means the page was loaded before this game type shipped a new
// round kind (a stale tab on a phone) — so a reload pulls the current code.
// Without this, the player would silently stall on a "getting ready" screen.
const unknownBlock = computed(() => !!instance.value && !block.value)
function reloadPage() {
  if (typeof window !== 'undefined') window.location.reload()
}
</script>

<template>
  <div class="player" aria-live="polite">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You are in!</h2>
      <p>Waiting for the host to start. Keep this page open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="unknownBlock" class="big">
      <h2>Tap to catch up</h2>
      <p>The host started a round this page hasn't loaded yet. Reload to jump in, your spot is saved.</p>
      <button class="btn btn-primary btn-lg" @click="reloadPage">Reload</button>
    </div>

    <div v-else-if="!instance || !block" class="big">Getting the next round…</div>

    <div v-else-if="!eligible" class="big">
      <h2>You joined mid-game</h2>
      <p>You can play this round and the ones after it. Watch the big screen!</p>
    </div>

    <div v-else-if="state === 'ready'" class="big">
      <h2>{{ prompt || block.name }}</h2>
      <p>Get ready, this round opens in a moment.</p>
    </div>

    <template v-else-if="state === 'open' && !submitted && value != null">
      <div class="kicker">{{ block.name }}</div>
      <h2 class="prompt">{{ prompt }}</h2>
      <img v-if="showImage" :src="image" alt="" class="player-img" @error="failedImage = true" />
      <component :is="block.PlayerInput" :content="content" v-model="value" />
      <button class="btn btn-primary btn-block btn-lg" :disabled="!canSubmit" @click="submit">
        Lock it in
      </button>
    </template>

    <div v-else-if="state === 'open' && submitted" class="big">
      <h2>Locked in</h2>
      <p>Waiting for everyone else…</p>
    </div>
    <div v-else-if="state === 'locked'" class="big">
      <h2>Time!</h2>
      <p>That's locked in. Watch the big screen for what's next.</p>
    </div>
    <component
      :is="block.PlayerReveal"
      v-else-if="state === 'reveal' && block.PlayerReveal && content"
      :content="content"
      :my-input="room.inputFor(index)"
      :reveal="room.roundRevealFor(index)"
    />
    <div v-else class="big">
      <h2>Results are up!</h2>
      <p>Check the big screen.</p>
    </div>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.big {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
}
.big h2 {
  font-size: clamp(28px, 8vw, 40px);
  font-weight: 800;
}
.big p {
  color: var(--ink-soft);
  max-width: 30ch;
  line-height: 1.45;
}
.prompt {
  font-size: clamp(22px, 6vw, 32px);
  font-weight: 800;
}
.player-img {
  width: 100%;
  max-height: 38vh;
  object-fit: contain;
  border-radius: 14px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
}
</style>
