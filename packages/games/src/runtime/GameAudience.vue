<script setup lang="ts">
/**
 * Read-only spectator surface (P4 audience tier). An audience member follows along
 * on their phone: the prompt + image, a status line for the round, and the running
 * standings, plus the full results at the end. It deliberately shows NO input (they
 * never submit) and never reads other players' answers (the engine doesn't even
 * subscribe an audience to inputs). A companion to the big screen, not a controller.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { StandingsPeek } from '@doot-games/ui'
import { computed, ref, watch } from 'vue'
import GameResults from './GameResults.vue'
import { getBlock } from './derive'

const props = defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(() => (room.config.value as unknown as GameComposition) ?? null)
const rounds = computed(() => config.value?.rounds ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
const instance = computed(() => rounds.value[index.value] ?? null)
const block = computed(() => (instance.value ? getBlock(props.plugin, instance.value.block) : undefined))
// The audience sees the shared content (authored or runtime-derived); never any
// per-player secret (the engine never delivers one to a spectator).
const content = computed(() => room.runtimeContentFor(index.value) ?? instance.value?.content ?? null)
const prompt = computed(() => (content.value as { prompt?: string } | null)?.prompt ?? '')
const image = computed(() => (content.value as { image?: string } | null)?.image ?? '')
const failedImage = ref(false)
watch(image, () => {
  failedImage.value = false
})
const showImage = computed(() => !!image.value && !failedImage.value)
const teams = computed(() => room.meta.value?.teams ?? [])
const standings = computed(() => room.standings.value as StandardResults | undefined)
const hasStandings = computed(() => (standings.value?.leaderboard?.length ?? 0) > 0)

// P4B: the audience can weigh in on a poll (an opinion round, nothing scored). Their
// votes go to a separate channel and show on the big screen as a capped "crowd" bloc.
const canVote = computed(() => block.value?.kind === 'poll' && state.value === 'open')
const pollOptions = computed(() => (content.value as { options?: Array<{ label: string }> } | null)?.options ?? [])
const myVote = ref<number | null>(null)
watch(index, () => {
  myVote.value = null
})
function vote(choice: number) {
  if (myVote.value != null) return
  room.submitAudience({ choice })
  myVote.value = choice
}

const status = computed(() => {
  switch (state.value) {
    case 'ready':
      return 'Get ready, the round is about to open.'
    case 'open':
      return 'Players are answering on their phones…'
    case 'locked':
      return "That's locked in. Watch the big screen."
    case 'reveal':
      return 'The results are on the big screen.'
    default:
      return ''
  }
})
</script>

<template>
  <div class="aud" aria-live="polite">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're watching</h2>
      <p>The game starts soon. Keep this page open and follow along on the big screen.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :teams="teams" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <template v-else-if="instance && block">
      <div class="watch-tag">Watching · round {{ index + 1 }} of {{ rounds.length }}</div>
      <div v-if="block.display && content" class="slide-mirror">
        <component :is="block.PlayerInput" :content="content" />
      </div>
      <template v-else>
        <div class="kicker">{{ block.name }}</div>
        <h2 class="prompt">{{ prompt || block.name }}</h2>
        <img v-if="showImage" :src="image" alt="" class="aud-img" @error="failedImage = true" />
        <div v-if="canVote" class="aud-vote" role="group" aria-label="Vote with the crowd">
          <p class="vote-hint">{{ myVote == null ? 'Vote with the crowd:' : "Your vote is in. Watch the big screen." }}</p>
          <button
            v-for="(o, i) in pollOptions"
            :key="i"
            type="button"
            class="aud-opt"
            :class="{ on: myVote === i }"
            :aria-pressed="myVote === i"
            :disabled="myVote != null"
            @click="vote(i)"
          >
            {{ o.label }}
          </button>
        </div>
        <p v-else class="status">{{ status }}</p>
      </template>
      <StandingsPeek
        v-if="hasStandings && standings"
        :results="standings"
        :teams="teams"
        class="aud-standings"
      />
    </template>

    <div v-else class="big">Getting the next round…</div>
  </div>
</template>

<style scoped>
.aud {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
.watch-tag {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 4px 12px;
}
.kicker {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 800;
  font-size: 12px;
  color: var(--ink-soft);
}
.prompt {
  font-size: clamp(22px, 6vw, 32px);
  font-weight: 800;
}
.aud-img {
  width: 100%;
  max-height: 36vh;
  object-fit: contain;
  border-radius: 14px;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
}
.status {
  color: var(--ink-soft);
  font-weight: 600;
}
.aud-vote {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vote-hint {
  font-weight: 700;
  color: var(--ink-soft);
}
.aud-opt {
  font: inherit;
  font-weight: 700;
  font-size: 17px;
  text-align: left;
  padding: 14px 16px;
  border-radius: 12px;
  border: 2px solid var(--line-soft);
  background: var(--surface-2);
  color: var(--ink);
  cursor: pointer;
}
.aud-opt.on {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 16%, var(--surface));
  color: var(--primary);
}
.aud-opt:disabled {
  cursor: default;
  opacity: 0.85;
}
.slide-mirror {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.aud-standings {
  flex: none;
  margin-top: auto;
}
</style>
