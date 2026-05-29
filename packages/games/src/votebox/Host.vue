<script setup lang="ts">
/** VoteBox host (big screen): lobby, the active round, and results. */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { ScorePlayer } from '@doot-games/sdk'
import {
  ControlBar,
  CountdownRing,
  DButton,
  OptionGrid,
  RoomTicket,
  RosterChips,
  VoteBars,
} from '@doot-games/ui'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  type VoteBoxConfig,
  type VoteBoxInput,
  isGuessInput,
  isRateInput,
  voteBoxConfigSchema,
} from './config'
import { voteBoxAnswerKeys, voteBoxRounds } from './rounds'
import { type VoteBoxResults, voteBoxScore } from './score'
import Results from './Results.vue'

const room = injectDootRoom()

const now = ref(0)
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  now.value = Date.now()
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 250)
})
onUnmounted(() => {
  if (ticker) clearInterval(ticker)
})

const config = computed<VoteBoxConfig | null>(() => {
  const c = room.config.value
  if (!c) return null
  const parsed = voteBoxConfigSchema.safeParse(c)
  return parsed.success ? parsed.data : null
})
const slides = computed(() => config.value?.slides ?? [])
const index = computed(() => room.round.value.index)
const state = computed(() => room.round.value.state)
const slide = computed(() => slides.value[index.value] ?? null)

const joinUrl = computed(() => {
  const code = room.runtime.room
  if (typeof window === 'undefined') return `/play/${code}`
  return `${window.location.origin}/play/${code}`
})

// --- live tallies -----------------------------------------------------------
const guessCounts = computed(() => {
  const s = slide.value
  if (!s || s.type !== 'guess') return []
  const counts = s.options.map(() => 0)
  for (const input of room.inputsFor(index.value).values()) {
    if (isGuessInput(input) && input.choice != null && counts[input.choice] != null) {
      counts[input.choice]++
    }
  }
  return counts
})
const ratingBars = computed(() => {
  const s = slide.value
  const cfg = config.value
  if (!s || s.type !== 'rate' || !cfg) return []
  const inputs = [...room.inputsFor(index.value).values()]
  return s.categories.map((cid) => {
    const cat = cfg.categories.find((c) => c.id === cid)
    let sum = 0
    let n = 0
    for (const input of inputs) {
      if (isRateInput(input) && typeof input.ratings[cid] === 'number') {
        sum += input.ratings[cid] as number
        n++
      }
    }
    return {
      label: cat?.label ?? cid,
      value: n ? sum / n : 0,
      max: cfg.ratingScale.max,
      note: n ? `${n} rating${n === 1 ? '' : 's'}` : 'waiting for ratings',
    }
  })
})

const countdown = computed(() => {
  const dl = room.round.value.deadline
  const timer = slide.value?.timer
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})

const stateLabel = computed(
  () =>
    ({ ready: 'Ready', open: 'Voting open', locked: 'Voting closed', reveal: 'Results' })[
      state.value
    ] ?? state.value,
)

// --- host actions -----------------------------------------------------------
function finish() {
  const cfg = config.value
  if (!cfg) return
  const players: ScorePlayer[] = room.players.value.map((p) => ({
    id: p.id,
    name: p.name,
    joinedAtIndex: p.joinedAtIndex,
  }))
  const summary = voteBoxScore({
    config: cfg,
    rounds: voteBoxRounds(cfg),
    players,
    inputsFor: (i) => room.inputsFor(i) as unknown as Map<string, VoteBoxInput>,
    answerKeys: voteBoxAnswerKeys(cfg),
  })
  room.host.finish(summary as unknown as RelayValue)
}
const isLast = computed(() => index.value >= slides.value.length - 1)
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="vb-lobby">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="roster-head">
        <div class="kicker">In the room</div>
        <span class="count mono">{{ room.players.value.length }} joined</span>
      </div>
      <RosterChips :players="room.players.value" />
      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="!config" @click="room.host.start()">
          Start game
        </DButton>
      </div>
      <p class="note">
        Players who join after you start can only vote on rounds from when they joined.
      </p>
    </section>
  </div>

  <!-- RESULTS -->
  <Results
    v-else-if="room.phase.value === 'results' && room.results.value"
    :results="room.results.value as unknown as VoteBoxResults"
  />

  <!-- ACTIVE -->
  <div v-else-if="slide" class="vb-stage">
    <div class="stage-grid">
      <div class="left">
        <span v-if="slide.subject" class="subject">{{ slide.subject }}</span>
        <h1 class="prompt">{{ slide.prompt }}</h1>
        <div class="imgbox">
          <img v-if="slide.image" :src="slide.image" alt="" />
          <div v-else class="ph">{{ (slide.subject || '?')[0] }}</div>
        </div>
      </div>
      <div class="right">
        <OptionGrid
          v-if="slide.type === 'guess'"
          :options="slide.options"
          :counts="state === 'ready' ? null : guessCounts"
          :correct="slide.correct"
          :revealed="state === 'reveal'"
          disabled
        />
        <VoteBars v-else :bars="ratingBars" :unit="`/ ${config?.ratingScale.max}`" />
      </div>
    </div>

    <ControlBar :round-index="index" :round-count="slides.length" :state-label="stateLabel">
      <CountdownRing v-if="countdown" :remaining="countdown.remaining" :total="countdown.total" />
      <DButton v-if="room.host.can('open')" variant="primary" size="lg" @click="room.host.openVoting()">
        Open voting
      </DButton>
      <DButton v-else-if="room.host.can('lock')" @click="room.host.lock()">Lock voting</DButton>
      <DButton v-else-if="room.host.can('reveal')" variant="primary" @click="room.host.reveal()">
        Reveal
      </DButton>
      <template v-else-if="state === 'reveal'">
        <DButton v-if="!isLast" variant="primary" size="lg" @click="room.host.next()">
          Next round
        </DButton>
        <DButton v-else variant="primary" size="lg" @click="finish()">Final results</DButton>
      </template>
    </ControlBar>
  </div>

  <div v-else class="vb-stage"><p>No slides in this game.</p></div>
</template>

<style scoped>
.vb-lobby {
  flex: 1;
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 18px;
  align-items: start;
}
.ticket-card {
  padding: 30px;
}
.roster-card {
  padding: 22px;
}
.roster-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.count {
  color: var(--c5);
  font-weight: 700;
}
.lobby-actions {
  margin-top: 18px;
}
.note {
  margin-top: 12px;
  font-size: 13px;
  color: var(--ink-soft);
}
.vb-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.stage-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
  align-items: center;
}
.subject {
  align-self: flex-start;
  background: var(--c3);
  color: var(--primary-ink);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 5px 15px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 14px;
}
.prompt {
  font-size: clamp(28px, 4.4vw, 52px);
  font-weight: 800;
  margin: 14px 0;
}
.imgbox {
  aspect-ratio: 4 / 3;
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--surface-2);
}
.imgbox img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.imgbox .ph {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 120px;
  color: var(--line-soft);
}
.left {
  display: flex;
  flex-direction: column;
}
@media (max-width: 900px) {
  .vb-lobby,
  .stage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
