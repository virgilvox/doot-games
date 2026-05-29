<script setup lang="ts">
/** VoteBox player surface: the phone input for guess and rate rounds. */
import { injectDootRoom } from '@doot-games/engine/vue'
import { OptionGrid, RatingStrip } from '@doot-games/ui'
import { computed, ref, watch } from 'vue'
import { type RateSlide, type VoteBoxConfig, voteBoxConfigSchema } from './config'
import Results from './Results.vue'

const room = injectDootRoom()

const config = computed<VoteBoxConfig | null>(() => {
  const c = room.config.value
  if (!c) return null
  const parsed = voteBoxConfigSchema.safeParse(c)
  return parsed.success ? parsed.data : null
})
const slides = computed(() => config.value?.slides ?? [])
const index = computed(() => room.round.value.index)
const slide = computed(() => slides.value[index.value] ?? null)
const submitted = computed(() => room.inputFor(index.value) !== undefined)
const eligible = computed(() => index.value >= room.joinedAtIndex.value)

const choice = ref<number | null>(null)
const ratings = ref<Record<string, number>>({})

watch(
  () => `${index.value}:${room.round.value.state}`,
  () => {
    choice.value = null
    const s = slide.value
    if (s && s.type === 'rate') {
      // Prefill to the scale minimum so the strip shows a value and what the
      // player sees matches what gets submitted.
      const min = config.value?.ratingScale.min ?? 1
      const init: Record<string, number> = {}
      for (const c of s.categories) init[c] = min
      ratings.value = init
    } else {
      ratings.value = {}
    }
  },
)

function categoriesFor(s: RateSlide) {
  return s.categories.map((id) => {
    const found = config.value?.categories.find((c) => c.id === id)
    return { id, label: found?.label ?? id }
  })
}

function submitGuess() {
  if (choice.value == null) return
  room.submit({ choice: choice.value })
}
function submitRate(s: RateSlide) {
  const out: Record<string, number> = {}
  for (const c of s.categories) out[c] = ratings.value[c] ?? config.value?.ratingScale.min ?? 1
  room.submit({ ratings: out })
}
</script>

<template>
  <div class="vb-player">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You are in!</h2>
      <p>Waiting for the host to start. Keep this page open.</p>
    </div>

    <Results
      v-else-if="room.phase.value === 'results' && room.results.value"
      :results="room.results.value as any"
      :me="room.me.value.name"
      compact
    />

    <div v-else-if="!slide" class="big">Get ready…</div>

    <div v-else-if="!eligible" class="big">
      <h2>You joined mid-game</h2>
      <p>You can play this round and the ones after it. Watch the big screen!</p>
    </div>

    <!-- ready -->
    <div v-else-if="room.round.value.state === 'ready'" class="big">
      <h2>{{ slide.subject || slide.prompt }}</h2>
      <p>Get ready — voting opens in a moment.</p>
    </div>

    <!-- open + not submitted -->
    <template v-else-if="room.round.value.state === 'open' && !submitted">
      <div class="kicker">{{ slide.type === 'guess' ? 'Guess' : 'Rate' }}</div>
      <h2 class="prompt">{{ slide.prompt }}</h2>
      <OptionGrid
        v-if="slide.type === 'guess'"
        :options="slide.options"
        :selected="choice"
        @select="choice = $event"
      />
      <RatingStrip
        v-else
        :categories="categoriesFor(slide)"
        :scale="config!.ratingScale"
        v-model="ratings"
      />
      <button
        class="btn btn-primary btn-block btn-lg"
        :disabled="slide.type === 'guess' && choice == null"
        @click="slide.type === 'guess' ? submitGuess() : submitRate(slide)"
      >
        Lock it in
      </button>
    </template>

    <!-- submitted / closed / reveal -->
    <div v-else-if="room.round.value.state === 'open' && submitted" class="big">
      <h2>Locked in</h2>
      <p>Waiting for everyone else…</p>
    </div>
    <div v-else-if="room.round.value.state === 'locked'" class="big">
      <h2>Time!</h2>
      <p>Voting is closed. Results coming up on the big screen.</p>
    </div>
    <div v-else class="big">
      <h2>{{ slide.type === 'guess' ? 'Answer is up!' : 'Ratings in!' }}</h2>
      <p>Check the big screen.</p>
    </div>
  </div>
</template>

<style scoped>
.vb-player {
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
