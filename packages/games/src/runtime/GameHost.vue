<script setup lang="ts">
/**
 * Generic host surface for any block-composed game: the lobby, the active round
 * (a common frame around the current block's HostDisplay), the control bar, and
 * the results. No game writes this, it delegates per round to the block.
 */
import type { RelayValue } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, ScorePlayer } from '@doot-games/sdk'
import { ControlBar, CountdownRing, DButton, RoomTicket, RosterChips } from '@doot-games/ui'
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import GameResults from './GameResults.vue'
import { gameAnswerKeys, getBlock, scoreGame } from './derive'

const props = defineProps<{ plugin: GamePlugin }>()
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
const content = computed<Record<string, unknown> | null>(
  () => (instance.value?.content as Record<string, unknown>) ?? null,
)
const subject = computed(() => content.value?.subject as string | undefined)
const prompt = computed(() => (content.value?.prompt as string | undefined) ?? '')
const image = computed(() => content.value?.image as string | undefined)
// Hide an image that fails to load rather than show a broken glyph on the big
// screen. Tracked per URL so a later round's valid image still renders.
const failedImages = reactive(new Set<string>())
const showImage = computed(() => !!image.value && !failedImages.has(image.value))
// Only expose the answer at reveal, even on the host's own screen, so a
// block's HostDisplay can never surface it early to the room watching the big screen.
const answer = computed(() =>
  state.value === 'reveal' && block.value?.answerOf && content.value
    ? block.value.answerOf(content.value)
    : undefined,
)

const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})
const countdown = computed(() => {
  const dl = room.round.value.deadline
  const timer = block.value?.timerOf && content.value ? block.value.timerOf(content.value) : null
  if (!dl || !timer) return null
  return { remaining: Math.max(0, dl - now.value), total: timer * 1000 }
})
const stateLabel = computed(
  () =>
    ({ ready: 'Ready', open: 'Voting open', locked: 'Voting closed', reveal: 'Results' })[
      state.value
    ] ?? state.value,
)
const isLast = computed(() => index.value >= rounds.value.length - 1)

function finish() {
  const cfg = config.value
  if (!cfg) return
  const players: ScorePlayer[] = room.players.value.map((p) => ({
    id: p.id,
    name: p.name,
    joinedAtIndex: p.joinedAtIndex,
  }))
  const summary = scoreGame(props.plugin, cfg, {
    inputsFor: (i) => room.inputsFor(i) as Map<string, unknown>,
    players,
    answerKeys: gameAnswerKeys(props.plugin, cfg),
  })
  room.host.finish(summary as unknown as RelayValue)
}
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="lobby">
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
        Players who join after you start can only play rounds from when they joined.
      </p>
    </section>
  </div>

  <!-- RESULTS -->
  <GameResults
    v-else-if="room.phase.value === 'results' && room.results.value"
    :results="room.results.value as any"
  />

  <!-- ACTIVE -->
  <div v-else-if="instance && block" class="stage">
    <div class="stage-grid">
      <div class="left">
        <span v-if="subject" class="subject">{{ subject }}</span>
        <h1 class="prompt">{{ prompt }}</h1>
        <div v-if="showImage" class="imgbox"><img :src="image" alt="" @error="failedImages.add(image!)" /></div>
      </div>
      <div class="right">
        <component
          :is="block.HostDisplay"
          :content="content"
          :inputs="room.inputsFor(index)"
          :state="state"
          :answer="answer"
        />
      </div>
    </div>

    <ControlBar :round-index="index" :round-count="rounds.length" :state-label="stateLabel">
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

  <div v-else class="stage"><p>This game has no rounds yet.</p></div>
</template>

<style scoped>
.lobby {
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
.stage {
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
.left {
  display: flex;
  flex-direction: column;
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
@media (max-width: 900px) {
  .lobby,
  .stage-grid {
    grid-template-columns: 1fr;
  }
}
</style>
