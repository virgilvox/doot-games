<script setup lang="ts">
/**
 * Generic player surface for any block-composed game: waiting/lobby/results
 * states are shared; the open-round input delegates to the current block's
 * PlayerInput. No game writes this.
 */
import type { ControlAction } from '@doot-games/engine'
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin, StandardResults } from '@doot-games/sdk'
import { Icon, StandingsPeek, teamColor } from '@doot-games/ui'
import { computed, ref, watch } from 'vue'
import GameResults from './GameResults.vue'
import { getBlock, ownMakeText } from './derive'

const props = defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

// Teams (when the host turned them on): the names to pick from, and this player's
// current pick. Shown in the lobby; the player taps to join a team.
const teams = computed(() => room.meta.value?.teams ?? [])

// Running standings (P3): the host publishes a between-round leaderboard; show it on
// the phone during the lull (locked / reveal) so the player watches their rank.
const standings = computed(() => room.standings.value as StandardResults | undefined)
const showStandings = computed(
  () => (state.value === 'reveal' || state.value === 'locked') && (standings.value?.leaderboard?.length ?? 0) > 0,
)

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
// relay; overlay it on the authored content when present. A hidden-role round
// delivers SECRET per-player content to this player's own address, which takes
// precedence over everything else (this is THIS player's view of the round).
const content = computed(
  () =>
    room.perPlayerContentFor(index.value) ??
    room.runtimeContentFor(index.value) ??
    instance.value?.content ??
    null,
)
const prompt = computed(() => (content.value as { prompt?: string } | null)?.prompt ?? '')
// Show the prompt image on the phone too (not only the host screen), so players
// who can't see the big screen still get the question. Hide it if it 404s.
const image = computed(() => (content.value as { image?: string } | null)?.image ?? '')
const failedImage = ref(false)
watch(image, () => {
  failedImage.value = false
})
const showImage = computed(() => !!image.value && !failedImage.value)
// An audio clip prompt plays on the big screen (the shared speaker); the phone
// shows a hint rather than echoing it from every device.
const hasAudio = computed(() => !!((content.value as { audio?: string } | null)?.audio))
const submitted = computed(() => room.inputFor(index.value) !== undefined)
const eligible = computed(() => index.value >= room.joinedAtIndex.value)

// On a judge round (vote/split/...), the votable text built from THIS player's own
// make submission, so the judge view can hide their own option and they can't vote
// for themselves. Empty for non-judge rounds. Computed locally from the player's
// own input, so the public gallery never carries author info (stays anonymous).
const myMakeText = computed(() =>
  config.value && block.value?.derive
    ? ownMakeText(props.plugin, config.value, index.value, (i) => room.inputFor(i))
    : '',
)

// ── Co-host / MC drive controls ────────────────────────────────────────────
// When the host has delegated driving to this player, mirror the host's "what's
// next" button on their phone. Tapping publishes an intent; the host applies it.
const roundCount = computed(() => rounds.value.length)
const isLast = computed(() => index.value >= roundCount.value - 1)
const isMakeRound = computed(() => {
  const next = rounds.value[index.value + 1]
  if (!next) return false
  const nextBlock = getBlock(props.plugin, next.block)
  if (!nextBlock?.derive) return false
  return (next.from ?? [index.value]).includes(index.value)
})
const driverAction = computed<{ type: ControlAction; label: string } | null>(() => {
  if (!room.isDriver.value || room.phase.value !== 'active') return null
  // A display round (slide / title card) advances as one step (the host collapses
  // the open/lock/reveal beat), so the driver gets a single button.
  if (block.value?.display) {
    return { type: 'next', label: isLast.value ? 'Final results' : 'Next slide →' }
  }
  switch (state.value) {
    case 'ready':
      return { type: 'open', label: isMakeRound.value ? 'Collect answers' : 'Open voting' }
    case 'open':
      return { type: 'lock', label: isMakeRound.value ? 'Lock answers' : 'Lock voting' }
    case 'locked':
      return isMakeRound.value
        ? { type: 'startVote', label: 'Start the vote' }
        : { type: 'reveal', label: 'Reveal' }
    case 'reveal':
      return isLast.value
        ? { type: 'finish', label: 'Final results' }
        : { type: 'next', label: 'Next round' }
    default:
      return null
  }
})

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
// round kind (a stale tab on a phone) - so a reload pulls the current code.
// Without this, the player would silently stall on a "getting ready" screen.
const unknownBlock = computed(() => !!instance.value && !block.value)
function reloadPage() {
  if (typeof window !== 'undefined') window.location.reload()
}
</script>

<template>
  <div class="player" aria-live="polite">
    <!-- MC controls: the host delegated driving to this player. -->
    <div v-if="driverAction" class="drive-bar">
      <span class="drive-tag"><Icon name="mc" :size="15" /> You're the MC · {{ index + 1 }}/{{ rounds.length }}</span>
      <button class="btn btn-primary drive-go" @click="room.sendControl(driverAction.type)">
        {{ driverAction.label }} →
      </button>
    </div>

    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You are in!</h2>
      <div v-if="teams.length" class="team-pick">
        <p class="team-pick-label">{{ room.myTeam.value ? 'Your team' : 'Pick your team' }}</p>
        <div class="team-opts" role="group" aria-label="Pick your team">
          <button
            v-for="(t, i) in teams"
            :key="t"
            type="button"
            class="team-opt"
            :class="{ on: room.myTeam.value === t }"
            :aria-pressed="room.myTeam.value === t"
            :style="{ '--team': teamColor(i) }"
            @click="room.setTeam(t)"
          >
            {{ t }}
          </button>
        </div>
      </div>
      <template v-if="room.isDriver.value">
        <p><Icon name="mc" :size="15" /> You're the MC. Kick it off when everyone's in.</p>
        <button class="btn btn-primary btn-block" @click="room.sendControl('start')">Start game →</button>
      </template>
      <p v-else>Waiting for the host to start. Keep this page open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" :teams="teams" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="unknownBlock" class="big">
      <h2>Tap to catch up</h2>
      <p>The host started a round this page hasn't loaded yet. Reload to jump in, your spot is saved.</p>
      <button class="btn btn-primary btn-lg" @click="reloadPage">Reload</button>
    </div>

    <div v-else-if="!instance || !block" class="big">Getting the next round…</div>

    <!-- Display block (slide / title card): show it to everyone, no input. -->
    <div v-else-if="block.display && content" class="slide-mirror">
      <component :is="block.PlayerInput" :content="content" />
      <p class="slide-foot">Watch the big screen.</p>
    </div>

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
      <p v-if="hasAudio" class="audio-hint"><Icon name="mic" :size="16" /> Listen to the big screen</p>
      <component
        :is="block.PlayerInput"
        :content="content"
        :my-make-text="block.derive ? myMakeText : undefined"
        v-model="value"
      />
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

    <StandingsPeek
      v-if="showStandings && standings"
      :results="standings"
      :me="room.me.value.name"
      :teams="teams"
      class="player-standings"
    />
  </div>
</template>

<style scoped>
.player {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}
.drive-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  border-radius: 12px;
  border: var(--bd) solid var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
}
.drive-tag {
  font-weight: 800;
  font-size: 13px;
  color: var(--ink-soft);
}
.drive-go {
  flex: none;
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
/* A mirrored slide / title card on the phone: fills the space and centers. */
.slide-mirror {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.slide-foot {
  text-align: center;
  color: var(--mute);
  font-size: 13px;
  font-weight: 600;
}
.player-standings {
  flex: none;
}
.audio-hint {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: center;
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 8px 16px;
}
/* Team picker (lobby) */
.team-pick {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
}
.team-pick-label {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 13px;
  color: var(--ink-soft);
}
.team-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.team-opt {
  font: inherit;
  font-weight: 800;
  font-size: 17px;
  color: var(--ink);
  background: var(--surface-2);
  border: 2px solid var(--line-soft);
  border-radius: 999px;
  padding: 10px 22px;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.1s, background 0.1s;
}
.team-opt:hover {
  transform: translateY(-1px);
  border-color: var(--team);
}
.team-opt.on {
  border-color: var(--team);
  background: color-mix(in srgb, var(--team) 20%, var(--surface));
  color: var(--team);
}
</style>
