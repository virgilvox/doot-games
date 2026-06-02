<script setup lang="ts">
/**
 * Truth or Share phone surface. Role-aware per turn, reading the host's `/x/turn`
 * state:
 *  - if you are the PICKER: choose a target and one of your dealt prompts.
 *  - if you are the TARGET: type an answer, or pass (always free).
 *  - otherwise: once the host shows the answer, tap one reaction.
 * Reconnect-safe: the turn state is retained and every action is keyed by pid.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { Icon } from '@doot-games/ui'
import { computed, onMounted, ref, watch } from 'vue'
import GameResults from '../runtime/GameResults.vue'
import { REACTION_KINDS, type ReactionKind, type TurnState } from './truthshare'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const myId = computed(() => room.me.value.id)

const turn = ref<TurnState | null>(null)
onMounted(() => {
  room.onExtra('turn', (v) => {
    turn.value = (v as TurnState | null) ?? null
  })
})

const phase = computed(() => turn.value?.phase ?? null)
const amPicker = computed(() => !!turn.value && turn.value.pickerPid === myId.value)
const amTarget = computed(() => !!turn.value && turn.value.target?.pid === myId.value)

// Reaction labels (positive-leaning, no emoji: a word + color).
const REACTION_LABELS: Record<ReactionKind, string> = { laugh: 'Ha!', love: 'Love', wow: 'Whoa', oof: 'Oof' }

// ── Picker: choose a target + a prompt ──────────────────────────────────────
// Targets come from the host-authoritative roster in the turn state (so the picker
// never depends on its own presence snapshot, which can lag behind the host's).
const roster = computed(() =>
  (turn.value?.roster ?? []).filter((r) => r.pid !== myId.value).map((r) => ({ id: r.pid, name: r.name })),
)
const chosenTarget = ref('')
const chosenPrompt = ref<number | null>(null)
const pickSent = ref(false)
function sendPick() {
  const t = turn.value
  if (!t || !amPicker.value || t.phase !== 'pick') return
  if (!chosenTarget.value || chosenPrompt.value == null) return
  pickSent.value = true
  room.publishExtra(`pick/${t.i}/${myId.value}`, { targetPid: chosenTarget.value, promptIndex: chosenPrompt.value })
}

// ── Target: answer or pass ──────────────────────────────────────────────────
const answer = ref('')
const responseSent = ref(false)
function sendAnswer() {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'respond') return
  const text = answer.value.trim()
  if (!text) return
  responseSent.value = true
  room.publishExtra(`response/${t.i}/${myId.value}`, { text, passed: false })
}
function pass() {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'respond') return
  responseSent.value = true
  room.publishExtra(`response/${t.i}/${myId.value}`, { text: '', passed: true })
}

// ── Everyone else: react ────────────────────────────────────────────────────
const myReaction = ref<ReactionKind | null>(null)
function react(kind: ReactionKind) {
  const t = turn.value
  if (!t || t.phase !== 'react' || amTarget.value) return
  myReaction.value = kind
  room.publishExtra(`react/${t.i}/${myId.value}`, { kind })
}

// Reset per-turn local state when the turn changes.
watch(
  () => turn.value?.i,
  () => {
    chosenTarget.value = ''
    chosenPrompt.value = null
    pickSent.value = false
    answer.value = ''
    responseSent.value = false
    myReaction.value = null
  },
)
</script>

<template>
  <div class="ts-player" aria-live="polite">
    <div v-if="!room.ready.value" class="big">Joining…</div>

    <div v-else-if="room.phase.value === 'lobby'" class="big">
      <h2>You're in</h2>
      <p>When it's your turn you'll put someone on the spot, or answer one yourself. Keep this open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="!turn" class="big"><h2>Getting ready…</h2></div>

    <!-- PICKER -->
    <template v-else-if="amPicker && phase === 'pick' && !pickSent">
      <div class="kicker"><Icon name="eye" :size="15" /> Your pick</div>
      <h2 class="q">Who is on the spot?</h2>
      <div class="opts">
        <button
          v-for="p in roster"
          :key="p.id"
          type="button"
          class="opt"
          :class="{ on: chosenTarget === p.id }"
          :aria-pressed="chosenTarget === p.id"
          @click="chosenTarget = p.id"
        >
          {{ p.name }}
        </button>
      </div>
      <h2 class="q">Pick a prompt</h2>
      <div class="opts col">
        <button
          v-for="(pr, i) in turn.choices ?? []"
          :key="i"
          type="button"
          class="opt prompt"
          :class="{ on: chosenPrompt === i }"
          :aria-pressed="chosenPrompt === i"
          @click="chosenPrompt = i"
        >
          {{ pr }}
        </button>
      </div>
      <button class="btn btn-primary btn-block btn-lg" :disabled="!chosenTarget || chosenPrompt == null" @click="sendPick">
        Put them on the spot
      </button>
    </template>

    <!-- TARGET -->
    <template v-else-if="amTarget && phase === 'respond' && !responseSent">
      <div class="kicker">{{ turn.pickerName }} asks you</div>
      <h2 class="q">{{ turn.prompt }}</h2>
      <textarea v-model="answer" class="answer-input" rows="4" maxlength="280" placeholder="Your answer..." aria-label="Your answer" />
      <button class="btn btn-primary btn-block btn-lg" :disabled="!answer.trim()" @click="sendAnswer">Answer</button>
      <button class="btn btn-ghost btn-block" @click="pass">Pass (no penalty)</button>
    </template>

    <!-- REACT (everyone but the target) -->
    <template v-else-if="phase === 'react' && !amTarget">
      <div class="kicker">{{ turn.target?.name }} said</div>
      <blockquote class="answer">{{ turn.response }}</blockquote>
      <h2 class="q">How'd they do?</h2>
      <div class="reacts">
        <button
          v-for="k in REACTION_KINDS"
          :key="k"
          type="button"
          class="react"
          :class="[k, { on: myReaction === k }]"
          :aria-pressed="myReaction === k"
          @click="react(k)"
        >
          {{ REACTION_LABELS[k] }}
        </button>
      </div>
      <p v-if="myReaction" class="hint">Reaction in. Tap another to change it.</p>
    </template>

    <!-- waiting / status states -->
    <div v-else-if="phase === 'result'" class="big">
      <h2 v-if="turn.passed">Pass taken</h2>
      <h2 v-else>Nice answer!</h2>
      <p v-if="!turn.passed">{{ turn.target?.name }} drew {{ turn.reactions?.total ?? 0 }} {{ (turn.reactions?.total ?? 0) === 1 ? 'reaction' : 'reactions' }}.</p>
      <p>Watch the big screen for what's next.</p>
    </div>
    <div v-else-if="amTarget && phase === 'react'" class="big">
      <h2>You're up on the screen</h2>
      <p>The room is reacting to your answer.</p>
    </div>
    <div v-else-if="amTarget && responseSent" class="big">
      <h2>Sent</h2>
      <p>The host is taking a look.</p>
    </div>
    <div v-else-if="amPicker && pickSent" class="big">
      <h2>Good pick</h2>
      <p>Watch the big screen.</p>
    </div>
    <div v-else class="big">
      <h2>Watch the big screen</h2>
      <p v-if="phase === 'pick'">{{ turn.pickerName }} is choosing who's next.</p>
      <p v-else-if="phase === 'respond'">{{ turn.target?.name }} is answering.</p>
      <p v-else>Hang tight.</p>
    </div>
  </div>
</template>

<style scoped>
.ts-player { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.kicker { text-align: center; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary); display: inline-flex; align-items: center; gap: 6px; justify-content: center; }
.q { text-align: center; font-size: clamp(19px, 5vw, 26px); font-weight: 800; }
.opts { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.opts.col { flex-direction: column; }
.opt {
  font: inherit;
  font-weight: 700;
  padding: 14px 18px;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface-2);
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.opt.prompt { text-align: left; }
.opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface-2)); }
.answer-input {
  width: 100%;
  resize: none;
  font: inherit;
  font-size: clamp(16px, 4.5vw, 20px);
  font-weight: 600;
  color: var(--ink);
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius);
  padding: 14px;
}
.answer-input:focus { outline: none; border-color: var(--primary); }
.answer {
  margin: 0;
  background: var(--surface-2);
  border: var(--bd) solid var(--line);
  border-left: 5px solid var(--primary);
  border-radius: var(--radius);
  padding: 16px 18px;
  font-weight: 700;
  font-size: clamp(17px, 4.5vw, 22px);
  line-height: 1.35;
}
.reacts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.react {
  font: inherit;
  font-weight: 800;
  font-size: clamp(18px, 5vw, 24px);
  padding: 18px;
  border-radius: var(--radius-lg);
  border: 3px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: transform 0.06s ease;
}
.react:active { transform: scale(0.96); }
.react.laugh.on { border-color: #f4b400; background: color-mix(in srgb, #f4b400 16%, var(--surface)); }
.react.love.on { border-color: #e0407b; background: color-mix(in srgb, #e0407b 16%, var(--surface)); }
.react.wow.on { border-color: #16a3c9; background: color-mix(in srgb, #16a3c9 16%, var(--surface)); }
.react.oof.on { border-color: #8a6bd6; background: color-mix(in srgb, #8a6bd6 16%, var(--surface)); }
.hint { text-align: center; color: var(--ink-soft); font-weight: 600; font-size: 14px; }
.big { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 12px; }
.big h2 { font-size: clamp(24px, 6.5vw, 34px); font-weight: 800; }
.big p { color: var(--ink-soft); max-width: 30ch; line-height: 1.45; }
</style>
