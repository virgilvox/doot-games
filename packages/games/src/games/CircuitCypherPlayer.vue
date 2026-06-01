<script setup lang="ts">
/**
 * Circuit Cypher's phone surface for the 1v1 tournament. A custom Player view
 * (the generic renderer can't sequence per-matchup battles):
 *
 *  - Write phase: finish the rhyming couplets (the `bars` block input), submitted
 *    to round 0 like any make round.
 *  - Battle phase: the host drives the bracket over `/x/battle`. This view reads
 *    the current matchup and, by `view`, lets the crowd tap-to-cheer the robot on
 *    the mic (a small, capped bonus) and cast the head-to-head A/B vote (the
 *    decider). Reconnect-safe: the battle state is retained, votes/cheers keyed by pid.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GameComposition, GamePlugin } from '@doot-games/sdk'
import { Icon } from '@doot-games/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { type BarsContent, type BarsInput, barsBlock } from '../blocks/bars/block'
import { type BattleState, scaffoldIndex } from './cypher-bracket'
import GameResults from '../runtime/GameResults.vue'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()

const config = computed<GameComposition | null>(
  () => (room.config.value as unknown as GameComposition) ?? null,
)
const content = computed<BarsContent | null>(
  () => (config.value?.rounds[0]?.content as BarsContent) ?? null,
)
const state = computed(() => room.round.value.state)
const myId = computed(() => room.me.value.id)

// ── My verse scaffold (each performer gets a different one) ────────────────
// The host publishes a unique scaffold index per player; until it arrives, fall
// back to a deterministic hash so the input is never blank.
const assignMap = ref<Record<string, number>>({})
const variants = computed<Array<{ couplets: BarsContent['couplets'] }>>(() => {
  const c = content.value
  if (!c) return []
  return c.variants?.length ? c.variants : [{ couplets: c.couplets }]
})
const myContent = computed<BarsContent | null>(() => {
  const c = content.value
  if (!c) return null
  const vs = variants.value
  if (!vs.length) return c
  const idx = assignMap.value[myId.value] ?? scaffoldIndex(myId.value, vs.length)
  return { ...c, couplets: (vs[idx] ?? vs[0])!.couplets }
})

// ── Battle channel (host-published, retained) ──────────────────────────────
const battle = ref<BattleState | null>(null)
onMounted(() => {
  room.onExtra('battle', (v) => {
    battle.value = (v as BattleState | null) ?? null
  })
  room.onExtra('assign', (v) => {
    assignMap.value = (v as Record<string, number> | null) ?? {}
  })
})
const inBattle = computed(() => room.phase.value === 'active' && !!battle.value)
const amLeft = computed(() => battle.value?.left.pid === myId.value)
const amRight = computed(() => battle.value?.right.pid === myId.value)
const amPerformer = computed(() => amLeft.value || amRight.value)
const onMic = computed(() => {
  const b = battle.value
  if (!b || b.view !== 'perform' || !b.performing) return null
  return b.performing === 'left' ? b.left : b.right
})

// ── Write phase (the bars input) ───────────────────────────────────────────
const value = ref<BarsInput | null>(null)
// Re-init when my assigned scaffold resolves (its couplet count may differ).
watch(
  () => `${state.value}:${myContent.value ? myContent.value.couplets.length : 0}`,
  () => {
    if (myContent.value) value.value = barsBlock.emptyInput(myContent.value)
  },
  { immediate: true },
)
const submitted = computed(() => room.inputFor(0) !== undefined)
const canSubmit = computed(() => {
  if (!myContent.value || !value.value) return false
  if (!room.hostPresent.value) return false
  return barsBlock.isComplete ? barsBlock.isComplete(myContent.value, value.value) : true
})
function submit() {
  if (canSubmit.value && value.value) room.submit(value.value as never)
}

// ── Voting (head-to-head, the decider) ─────────────────────────────────────
const myVote = ref<'a' | 'b' | null>(null)
watch(
  () => battle.value?.i,
  () => {
    myVote.value = null
  },
)
function vote(choice: 'a' | 'b') {
  const b = battle.value
  if (!b || b.view !== 'vote') return
  if ((choice === 'a' && amLeft.value) || (choice === 'b' && amRight.value)) return
  myVote.value = choice
  room.publishExtra(`vote/${b.i}/${myId.value}`, { choice })
}

// ── Co-host / MC drive controls ────────────────────────────────────────────
// When the host delegated driving to this player, show ONE button for the
// current primary action (computed from state the phone already has) and send an
// intent over `/x/drive`; the host validates + applies it.
const driveLabel = computed<string | null>(() => {
  if (!room.isDriver.value || room.phase.value !== 'active') return null
  const b = battle.value
  if (inBattle.value && b) {
    if (b.view === 'vote') return 'Reveal the winner'
    if (b.view === 'result') return b.i >= b.total - 1 ? 'Crown the MC' : 'Next battle'
    return 'Skip ahead'
  }
  if (state.value === 'ready') return 'Open the mic'
  if (state.value === 'open') return 'Close the mic'
  return null
})
let driveNonce = 0
function drive() {
  driveNonce = Math.max(typeof Date !== 'undefined' ? Date.now() : 0, driveNonce + 1)
  // A two-level key (drive/<pid>/cmd) so the host's `drive/*/*` subscription
  // matches, exactly like the vote/cheer channels. Stable key per pid (overwritten
  // each tap), so it never accumulates relay keys.
  room.publishExtra(`drive/${room.me.value.id}/cmd`, { nonce: driveNonce })
}

// ── Cheers (live crowd energy during a performance) ────────────────────────
const cheerCount = ref(0)
let lastCheer = 0
function cheer() {
  const b = battle.value
  const side = b?.performing
  if (!b || b.view !== 'perform' || !side) return
  const t = typeof performance !== 'undefined' ? performance.now() : 0
  if (t - lastCheer < 320) return
  lastCheer = t
  cheerCount.value++
  room.publishExtra(`cheer/${b.i}/${myId.value}`, { side })
}
watch([() => battle.value?.i, () => battle.value?.view, () => battle.value?.performing], () => {
  cheerCount.value = 0
})
</script>

<template>
  <div class="cc-player" aria-live="polite">
    <div v-if="driveLabel" class="drive-bar">
      <span class="drive-tag"><Icon name="mc" :size="15" /> You're the MC</span>
      <button class="btn btn-primary drive-go" @click="drive">{{ driveLabel }} →</button>
    </div>

    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're in the cypher!</h2>
      <p>Get your bars ready. Keep this page open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <!-- BATTLE PHASE -->
    <template v-else-if="inBattle && battle">
      <div class="kicker">Battle {{ battle.i + 1 }} of {{ battle.total }}</div>

      <!-- intro -->
      <div v-if="battle.view === 'intro'" class="big">
        <h2><span class="l">{{ battle.left.name }}</span> vs <span class="r">{{ battle.right.name }}</span></h2>
        <p>{{ amPerformer ? "You're up! Get ready to spit." : 'Watch the big screen, then vote.' }}</p>
      </div>

      <!-- perform: cheer the bot on the mic -->
      <template v-else-if="battle.view === 'perform'">
        <div class="big mic-now">
          <p class="onmic" :class="battle.performing"><Icon name="mic" :size="22" /> {{ onMic ? onMic.name : 'Next up…' }}</p>
          <button v-if="onMic" class="cheer" type="button" @click="cheer">
            <Icon name="cheer" :size="24" />
            <span>Cheer{{ cheerCount > 0 ? ` ×${cheerCount}` : '' }}</span>
          </button>
          <p class="hint">{{ onMic ? 'Hype up the bot on the mic!' : 'Here comes the next verse.' }}</p>
        </div>
      </template>

      <!-- vote -->
      <template v-else-if="battle.view === 'vote' && !myVote">
        <p class="vote-q">Who had the hottest bars?</p>
        <div class="vote-opts">
          <button type="button" class="vote-opt l" :disabled="amLeft" @click="vote('a')">
            <span class="vo-name">{{ battle.left.name }}</span>
            <span v-if="amLeft" class="vo-you">your bars</span>
          </button>
          <button type="button" class="vote-opt r" :disabled="amRight" @click="vote('b')">
            <span class="vo-name">{{ battle.right.name }}</span>
            <span v-if="amRight" class="vo-you">your bars</span>
          </button>
        </div>
        <p v-if="amPerformer" class="hint">You're on the mic, so vote for your challenger or sit this one out.</p>
      </template>
      <div v-else-if="battle.view === 'vote' && myVote" class="big">
        <h2>Vote in!</h2>
        <p>Waiting for the rest of the crowd…</p>
      </div>

      <!-- result -->
      <div v-else-if="battle.view === 'result'" class="big">
        <h2>
          {{
            battle.winner === 'tie'
              ? "It's a tie!"
              : `${(battle.winner === 'left' ? battle.left : battle.right).name} takes it!`
          }}
        </h2>
        <p>Watch the big screen for the next battle.</p>
      </div>
    </template>

    <!-- WRITE PHASE -->
    <div v-else-if="!content" class="big">Getting the cypher ready…</div>

    <div v-else-if="state === 'ready'" class="big">
      <h2>{{ content.prompt }}</h2>
      <p>Get ready, the mic opens in a moment.</p>
    </div>

    <template v-else-if="state === 'open' && !submitted && value && myContent">
      <div class="kicker">Drop your bars</div>
      <component :is="barsBlock.PlayerInput" :content="myContent" v-model="value" />
      <button class="btn btn-primary btn-block btn-lg" :disabled="!canSubmit" @click="submit">
        Lock in my verse
      </button>
    </template>

    <div v-else-if="state === 'open' && submitted" class="big">
      <h2>Bars locked in</h2>
      <p>Waiting for the other MCs…</p>
    </div>

    <div v-else class="big">
      <h2>Mic's closed</h2>
      <p>The robots are about to battle. Watch the big screen!</p>
    </div>
  </div>
</template>

<style scoped>
.cc-player {
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
.kicker {
  text-align: center;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-soft);
}
.big {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 12px;
}
.big h2 {
  font-size: clamp(24px, 6.5vw, 36px);
  font-weight: 800;
}
.big p {
  color: var(--ink-soft);
  max-width: 30ch;
  line-height: 1.45;
}
.l {
  color: #0088b3;
}
.r {
  color: #b3005f;
}
.hint {
  text-align: center;
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 14px;
}
.onmic {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 6vw, 28px);
}
.cheer {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font: inherit;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 6vw, 30px);
  color: var(--primary-ink);
  background: var(--primary);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 18px 36px;
  box-shadow: var(--shadow);
  cursor: pointer;
  transition: transform 0.06s ease;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.cheer:active {
  transform: scale(0.94);
}
.vote-q {
  text-align: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(18px, 5vw, 24px);
}
.vote-opts {
  display: grid;
  gap: 12px;
}
.vote-opt {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font: inherit;
  background: var(--surface);
  border: 3px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 22px 16px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.06s ease, border-color 0.12s ease;
}
.vote-opt.l {
  border-color: #16e0ff;
}
.vote-opt.r {
  border-color: #ff2d9b;
}
.vote-opt:not(:disabled):active {
  transform: scale(0.98);
}
.vote-opt:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.vo-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(20px, 5.5vw, 26px);
  color: var(--ink);
}
.vo-you {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--mute);
}
</style>
