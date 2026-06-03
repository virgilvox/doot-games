<script setup lang="ts">
/**
 * QUIZ OR DIE phone surface. It reads the host's retained `/x/show` and renders the
 * controller for the current phase and the player's own fate:
 *  - question: alive players tap an answer (the dead watch the big screen).
 *  - cellar: at-risk players play the minigame (pick a cup, spin, roll, take/leave).
 *  - finale: racers tap every option that belongs; the out watch.
 * It never receives the correct answer until the host reveals it. Intents go on the
 * per-player channels the host listens to; a no-answer simply never arrives and the
 * host's deadline handles it.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { computed, onMounted, ref, watch } from 'vue'
import GameResults from '../runtime/GameResults.vue'
import { doll, ghostDoll } from './quiz-or-die-cast'
import type { CastView, ShowState } from './quiz-or-die-show'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

const show = ref<ShowState | null>(null)
onMounted(() => {
  room.onExtra('show', (v) => {
    show.value = (v as ShowState | null) ?? null
  })
})

const me = computed<CastView | null>(() => show.value?.cast.find((c) => c.pid === myId.value) ?? null)
const joined = computed(() => !!me.value) // a contestant frozen in at start
const phase = computed(() => show.value?.phase ?? null)
const amAlive = computed(() => me.value?.alive ?? false)
const amAtRisk = computed(() => (show.value?.cellar?.atRisk ?? show.value?.reveal?.atRisk ?? []).includes(myId.value))

// ── local submit tracking (reset per question / floor / finale round) ──
const myAnswer = ref<number | null>(null)
const sent = ref(false)
watch(
  () => [show.value?.question?.qIndex, show.value?.cellar?.floor, show.value?.cellar?.game, show.value?.finale?.round, show.value?.phase].join(':'),
  () => {
    myAnswer.value = null
    sent.value = false
    finPicks.value = []
  },
)

// ── trivia ──
function answer(i: number) {
  const q = show.value?.question
  if (!q || phase.value !== 'question' || !amAlive.value || sent.value) return
  myAnswer.value = i
  sent.value = true
  room.publishExtra(`ans/${q.qIndex}/${myId.value}`, { choice: i })
}

// ── cellar ──
const cellar = computed(() => show.value?.cellar ?? null)
const amActive = computed(() => cellar.value?.activePid === myId.value)
function pickCup(i: number) {
  const c = cellar.value
  if (!c || c.game !== 'chalice' || c.step !== 'choose' || !amAtRisk.value || sent.value) return
  myAnswer.value = i
  sent.value = true
  room.publishExtra(`cup/${c.floor}/${myId.value}`, { pick: i })
}
function spin() {
  const c = cellar.value
  if (!c || c.game !== 'wheel' || !amActive.value || sent.value) return
  sent.value = true
  room.publishExtra(`spin/${c.floor}/${myId.value}`, { nonce: 1 })
}
function roll() {
  const c = cellar.value
  if (!c || c.game !== 'dice' || !amActive.value || sent.value) return
  sent.value = true
  room.publishExtra(`roll/${c.floor}/${myId.value}`, { nonce: 1 })
}
function money(take: boolean) {
  const c = cellar.value
  if (!c || c.game !== 'money' || c.step !== 'choose' || !amAtRisk.value || sent.value) return
  myAnswer.value = take ? 1 : 0
  sent.value = true
  room.publishExtra(`money/${c.floor}/${myId.value}`, { take })
}

// ── finale ──
const finale = computed(() => show.value?.finale ?? null)
const amRacing = computed(() => {
  const r = finale.value?.racers.find((x) => x.pid === myId.value)
  return !!r && !r.out
})
const finPicks = ref<number[]>([])
function toggleFin(i: number) {
  if (!finale.value || finale.value.reveal || sent.value || !amRacing.value) return
  finPicks.value = finPicks.value.includes(i) ? finPicks.value.filter((n) => n !== i) : [...finPicks.value, i]
}
function sendFin() {
  const f = finale.value
  if (!f || f.reveal || sent.value || !amRacing.value) return
  sent.value = true
  room.publishExtra(`fin/${f.round}/${myId.value}`, { picks: finPicks.value })
}
const amGhost = computed(() => me.value?.alive === false)
</script>

<template>
  <div class="qod-player" aria-live="polite">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're in the house</h2>
      <p>Keep this open. You'll answer trivia here. Get it wrong and the host comes for you.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="!show || !joined" class="big">
      <h2>Spectating</h2>
      <p>This show already started. Watch the big screen, you're in on the next one.</p>
    </div>

    <!-- your doll badge -->
    <template v-else>
      <div class="me-badge" :class="{ ghost: !amAlive, atrisk: amAtRisk && amAlive }">
        <div class="me-doll" v-html="amAlive ? doll(me!.shape, me!.color) : ghostDoll(me!.color)" />
        <div class="me-info">
          <span class="me-name">{{ me!.name }}</span>
          <span class="me-state">{{ !amAlive ? 'Ghost' : amAtRisk ? 'In the Cellar' : 'Alive' }} · ${{ me!.money }}</span>
        </div>
      </div>

      <!-- QUESTION -->
      <template v-if="phase === 'question'">
        <template v-if="amAlive">
          <div class="kicker">{{ show.question?.cat }}</div>
          <h2 class="q">{{ show.question?.q }}</h2>
          <div class="opts">
            <button v-for="(o, i) in show.question?.a ?? []" :key="i" type="button" class="opt" :class="{ on: myAnswer === i, locked: sent }" :disabled="sent" @click="answer(i)">
              <span class="n">{{ i + 1 }}</span>{{ o }}
            </button>
          </div>
          <p v-if="sent" class="hint">Locked in. Pray.</p>
        </template>
        <div v-else class="big"><h2>You're a ghost</h2><p>Watch the living squirm on the big screen.</p></div>
      </template>

      <!-- REVEAL -->
      <div v-else-if="phase === 'reveal'" class="big">
        <template v-if="amAlive && show.reveal && myAnswer === show.reveal.correct">
          <h2 class="good">Correct</h2><p>+$1000. You live. For now.</p>
        </template>
        <template v-else-if="amAlive && amAtRisk">
          <h2 class="bad">Wrong</h2><p>Down to the Cellar with you.</p>
        </template>
        <template v-else><h2>Watch the screen</h2></template>
      </div>

      <!-- CELLAR -->
      <template v-else-if="phase === 'cellar' && cellar">
        <template v-if="!amAtRisk">
          <div class="big"><h2>The Cellar</h2><p>You're safe up here. Watch them sweat.</p></div>
        </template>
        <!-- entering the cellar (no minigame chosen yet) -->
        <template v-else-if="cellar.step === 'intro'">
          <div class="big"><h2 class="bad">Down to the Cellar</h2><p>A little game decides if you live. Watch the big screen.</p></div>
        </template>
        <!-- chalice -->
        <template v-else-if="cellar.game === 'chalice'">
          <h2 class="q">Pick a cup. One of them bites back.</h2>
          <div class="cup-grid">
            <button v-for="i in cellar.cups ?? 0" :key="i" type="button" class="cup-btn" :class="{ on: myAnswer === i - 1, locked: sent }" :disabled="sent || cellar.step !== 'choose'" @click="pickCup(i - 1)">{{ i }}</button>
          </div>
          <p v-if="sent" class="hint">Bottoms up.</p>
        </template>
        <!-- wheel -->
        <template v-else-if="cellar.game === 'wheel'">
          <template v-if="amActive">
            <h2 class="q">The Reaper's Wheel</h2>
            <button type="button" class="btn btn-primary btn-block btn-lg" :disabled="sent" @click="spin">{{ sent ? 'Spinning…' : 'SPIN' }}</button>
          </template>
          <div v-else class="big"><h2>Wait your turn</h2><p>The wheel is spinning for someone else.</p></div>
        </template>
        <!-- dice -->
        <template v-else-if="cellar.game === 'dice'">
          <template v-if="amActive">
            <h2 class="q">Roll {{ cellar.higher ? 'higher' : 'lower' }} than {{ cellar.target }}</h2>
            <button type="button" class="btn btn-primary btn-block btn-lg" :disabled="sent" @click="roll">{{ sent ? 'Rolling…' : 'ROLL' }}</button>
          </template>
          <div v-else class="big"><h2>Wait your turn</h2><p>The bones are rolling for someone else.</p></div>
        </template>
        <!-- money -->
        <template v-else-if="cellar.game === 'money'">
          <h2 class="q">Take the money?</h2>
          <div class="two">
            <button type="button" class="btn btn-primary btn-lg" :class="{ on: myAnswer === 1 }" :disabled="sent" @click="money(true)">Take it</button>
            <button type="button" class="btn btn-ghost btn-lg" :class="{ on: myAnswer === 0 }" :disabled="sent" @click="money(false)">Walk away</button>
          </div>
          <p v-if="sent" class="hint">Choice made.</p>
        </template>
      </template>

      <!-- DEATH -->
      <div v-else-if="phase === 'death'" class="big">
        <h2 v-if="show.death?.pid === myId" class="bad">You died</h2>
        <h2 v-else>The Cellar claims another</h2>
        <p>Watch the big screen.</p>
      </div>

      <!-- FINALE -->
      <template v-else-if="phase === 'finale' && finale">
        <template v-if="amRacing && finale.cat">
          <div class="kicker">{{ amGhost ? 'Chase them down' : 'Run for the door' }} · {{ finale.cat }}</div>
          <h2 class="q">Tap every answer that belongs</h2>
          <div class="opts">
            <button v-for="(o, i) in finale.opts" :key="i" type="button" class="opt" :class="{ on: finPicks.includes(i), locked: sent || finale.reveal, good: finale.reveal && finale.ok?.[i] }" :disabled="sent || finale.reveal" @click="toggleFin(i)">{{ o.t }}</button>
          </div>
          <button v-if="!sent && !finale.reveal" type="button" class="btn btn-primary btn-block btn-lg" @click="sendFin">Lock in</button>
          <p v-else-if="sent" class="hint">Locked in. {{ amGhost ? 'Gain on them.' : 'Run!' }}</p>
        </template>
        <div v-else class="big">
          <h2>{{ amRacing ? 'Watch the screen' : 'You are out' }}</h2>
          <p>{{ amRacing ? 'The next category is coming.' : 'The dark took you. Watch the finish.' }}</p>
        </div>
      </template>

      <!-- ENDING -->
      <div v-else class="big">
        <template v-if="phase === 'ending' && show.ending?.survivors?.includes(myId)">
          <h2 class="good">You escaped</h2><p>Out the door. Alive. The host hates a loose end.</p>
        </template>
        <template v-else><h2>Watch the big screen</h2></template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.qod-player { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.me-badge { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface-2); }
.me-badge.ghost { opacity: 0.7; }
.me-badge.atrisk { border-color: #c41f1f; box-shadow: 0 0 0 2px color-mix(in srgb, #c41f1f 30%, transparent); }
.me-doll { width: 40px; height: 40px; flex: none; }
.me-doll :deep(svg) { width: 100%; height: 100%; overflow: visible; }
.me-info { display: flex; flex-direction: column; line-height: 1.2; }
.me-name { font-weight: 800; }
.me-state { font-size: 12px; color: var(--mute); }
.kicker { text-align: center; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); }
.q { text-align: center; font-size: clamp(18px, 5vw, 26px); font-weight: 800; }
.opts { display: flex; flex-direction: column; gap: 10px; }
.opt { font: inherit; font-weight: 700; padding: 14px 16px; border-radius: var(--radius); border: var(--bd) solid var(--line-soft); background: var(--surface-2); color: var(--ink); cursor: pointer; text-align: left; display: flex; align-items: center; gap: 10px; }
.opt .n { display: inline-flex; align-items: center; justify-content: center; width: 1.5em; height: 1.5em; border-radius: 4px; background: var(--surface); font-size: 13px; }
.opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 16%, var(--surface-2)); }
.opt.good { border-color: #4caf50; background: color-mix(in srgb, #4caf50 18%, var(--surface-2)); }
.opt.locked { cursor: default; }
.opt:disabled { cursor: default; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.two .on { outline: 3px solid var(--primary); }
.cup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px, 1fr)); gap: 12px; }
.cup-btn { font: inherit; font-weight: 800; font-size: 22px; padding: 22px 0; border-radius: var(--radius-lg); border: 3px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; }
.cup-btn.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 18%, var(--surface)); }
.cup-btn:disabled { cursor: default; }
.hint { text-align: center; color: var(--ink-soft); font-weight: 600; font-size: 14px; }
.big { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
.big h2 { font-size: clamp(22px, 6vw, 32px); font-weight: 800; }
.big p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
.good { color: #2e9e4f; }
.bad { color: #c41f1f; }
</style>
