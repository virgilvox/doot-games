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
const content = computed(() => instance.value?.content ?? null)
const prompt = computed(() => (content.value as { prompt?: string } | null)?.prompt ?? '')
const submitted = computed(() => room.inputFor(index.value) !== undefined)
const eligible = computed(() => index.value >= room.joinedAtIndex.value)

const value = ref<unknown>(null)
watch(
  () => `${index.value}:${state.value}`,
  () => {
    value.value = block.value && content.value ? block.value.emptyInput(content.value) : null
  },
  { immediate: true },
)
const canSubmit = computed(() => {
  if (!block.value || !content.value) return false
  return block.value.isComplete ? block.value.isComplete(content.value, value.value) : true
})
function submit() {
  if (!canSubmit.value) return
  room.submit(value.value as never)
}
</script>

<template>
  <div class="player">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You are in!</h2>
      <p>Waiting for the host to start. Keep this page open.</p>
    </div>

    <GameResults
      v-else-if="room.phase.value === 'results' && room.results.value"
      :results="room.results.value as any"
      :me="room.me.value.name"
      compact
    />

    <div v-else-if="!instance || !block" class="big">Get ready…</div>

    <div v-else-if="!eligible" class="big">
      <h2>You joined mid-game</h2>
      <p>You can play this round and the ones after it. Watch the big screen!</p>
    </div>

    <div v-else-if="state === 'ready'" class="big">
      <h2>{{ prompt || block.name }}</h2>
      <p>Get ready — voting opens in a moment.</p>
    </div>

    <template v-else-if="state === 'open' && !submitted">
      <div class="kicker">{{ block.name }}</div>
      <h2 class="prompt">{{ prompt }}</h2>
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
      <p>Voting is closed. Results coming up on the big screen.</p>
    </div>
    <div v-else class="big">
      <h2>Answers are up!</h2>
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
</style>
