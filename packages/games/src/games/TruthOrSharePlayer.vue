<script setup lang="ts">
/**
 * Truth or Share phone surface. Role-aware per turn, reading the host's `/x/turn`:
 *  - PICKER, phase `pick`:   choose who is on the spot.
 *  - TARGET, phase `mode`:   choose Truth (answer in words) or Share (a photo).
 *  - PICKER, phase `prompt`: pick a prompt for that mode, or write your own.
 *  - TARGET, phase `respond`: type a truth answer, or snap/upload a photo. Pass is
 *    always free; you confirm your own photo here before it goes to the screen.
 *  - everyone else, phase `react`: tap one reaction.
 * A shared photo is downscaled on-device and sent over the relay (never uploaded to
 * storage); only the host's big screen renders it.
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
const REACTION_LABELS: Record<ReactionKind, string> = { laugh: 'Ha!', love: 'Love', wow: 'Whoa', oof: 'Oof' }

// ── Picker, phase pick: choose a target (from the host-authoritative roster) ──
const roster = computed(() =>
  (turn.value?.roster ?? []).filter((r) => r.pid !== myId.value).map((r) => ({ id: r.pid, name: r.name })),
)
const chosenTarget = ref('')
const pickSent = ref(false)
function sendTarget() {
  const t = turn.value
  if (!t || !amPicker.value || t.phase !== 'pick' || !chosenTarget.value) return
  pickSent.value = true
  room.publishExtra(`pick/${t.i}/${myId.value}`, { targetPid: chosenTarget.value })
}

// ── Target, phase mode: Truth or Share ───────────────────────────────────────
const modeSent = ref(false)
function chooseMode(mode: 'truth' | 'share') {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'mode') return
  modeSent.value = true
  room.publishExtra(`mode/${t.i}/${myId.value}`, { mode })
}

// ── Picker, phase prompt: pick a prompt for the chosen mode, or write your own ─
const chosenPrompt = ref<number | null>(null)
const writingOwn = ref(false)
const customPrompt = ref('')
const promptSent = ref(false)
function sendPrompt() {
  const t = turn.value
  if (!t || !amPicker.value || t.phase !== 'prompt') return
  if (writingOwn.value) {
    const custom = customPrompt.value.trim()
    if (!custom) return
    promptSent.value = true
    room.publishExtra(`pick/${t.i}/${myId.value}`, { customPrompt: custom })
    return
  }
  if (chosenPrompt.value == null) return
  promptSent.value = true
  room.publishExtra(`pick/${t.i}/${myId.value}`, { promptIndex: chosenPrompt.value })
}

// ── Target, phase respond: truth (text) or share (photo) ──────────────────────
const answer = ref('')
const photo = ref('') // a downscaled JPEG data URL, ready to send
const compressing = ref(false)
const responseSent = ref(false)
async function onPhotoPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  compressing.value = true
  try {
    photo.value = await compressPhoto(file)
  } catch {
    photo.value = ''
  } finally {
    compressing.value = false
  }
}
/** Read, downscale (longest side <= 560px), and re-encode as a small JPEG so the
 *  bitmap fits comfortably in a relay value (it never touches storage). */
async function compressPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = () => rej(new Error('read'))
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('decode'))
    im.src = dataUrl
  })
  const max = 560
  const scale = Math.min(1, max / Math.max(img.width || max, img.height || max))
  const w = Math.max(1, Math.round((img.width || max) * scale))
  const h = Math.max(1, Math.round((img.height || max) * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return c.toDataURL('image/jpeg', 0.5)
}
function sendTruth() {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'respond') return
  const text = answer.value.trim()
  if (!text) return
  responseSent.value = true
  room.publishExtra(`response/${t.i}/${myId.value}`, { text, passed: false })
}
function sendPhoto() {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'respond' || !photo.value) return
  responseSent.value = true
  room.publishExtra(`photo/${t.i}/${myId.value}`, { media: photo.value })
}
function pass() {
  const t = turn.value
  if (!t || !amTarget.value || t.phase !== 'respond') return
  responseSent.value = true
  room.publishExtra(`response/${t.i}/${myId.value}`, { text: '', passed: true })
}

// ── Everyone else, phase react ───────────────────────────────────────────────
const myReaction = ref<ReactionKind | null>(null)
function react(kind: ReactionKind) {
  const t = turn.value
  if (!t || t.phase !== 'react' || amTarget.value) return
  myReaction.value = kind
  room.publishExtra(`react/${t.i}/${myId.value}`, { kind })
}

watch(
  () => turn.value?.i,
  () => {
    chosenTarget.value = ''
    pickSent.value = false
    modeSent.value = false
    chosenPrompt.value = null
    writingOwn.value = false
    customPrompt.value = ''
    promptSent.value = false
    answer.value = ''
    photo.value = ''
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
      <p>When it's your turn you'll put someone on the spot, or get put on it yourself. Keep this open.</p>
    </div>

    <template v-else-if="room.phase.value === 'results' && room.results.value">
      <GameResults :results="room.results.value as any" :me="room.me.value.name" compact />
      <a class="btn btn-ghost btn-block" href="/">Back to start</a>
    </template>

    <div v-else-if="!turn" class="big"><h2>Getting ready…</h2></div>

    <!-- PICKER: choose a target -->
    <template v-else-if="amPicker && phase === 'pick' && !pickSent">
      <div class="kicker"><Icon name="eye" :size="15" /> Your call</div>
      <h2 class="q">Who is on the spot?</h2>
      <div class="opts">
        <button v-for="p in roster" :key="p.id" type="button" class="opt" :class="{ on: chosenTarget === p.id }" :aria-pressed="chosenTarget === p.id" @click="chosenTarget = p.id">{{ p.name }}</button>
      </div>
      <button class="btn btn-primary btn-block btn-lg" :disabled="!chosenTarget" @click="sendTarget">Put them on the spot</button>
    </template>

    <!-- TARGET: truth or share -->
    <template v-else-if="amTarget && phase === 'mode' && !modeSent">
      <div class="kicker">{{ turn.pickerName }} put you on the spot</div>
      <h2 class="q">Truth, or Share?</h2>
      <div class="mode-pick">
        <button type="button" class="mode mode-truth" @click="chooseMode('truth')">
          <Icon name="eye" :size="26" />
          <span class="mode-t">Truth</span>
          <span class="mode-d">Answer a question out loud</span>
        </button>
        <button type="button" class="mode mode-share" @click="chooseMode('share')">
          <Icon name="cpu" :size="26" />
          <span class="mode-t">Share</span>
          <span class="mode-d">Show a photo from your phone</span>
        </button>
      </div>
      <p class="hint">Not feeling it? You can pass on the next screen.</p>
    </template>

    <!-- PICKER: pick the prompt for the chosen mode -->
    <template v-else-if="amPicker && phase === 'prompt' && !promptSent">
      <div class="kicker">{{ turn.target?.name }} chose {{ turn.mode === 'share' ? 'Share' : 'Truth' }}</div>
      <h2 class="q">{{ turn.mode === 'share' ? 'What should they show?' : 'What should they answer?' }}</h2>
      <div v-if="!writingOwn" class="opts col">
        <button v-for="(pr, i) in turn.choices ?? []" :key="i" type="button" class="opt prompt" :class="{ on: chosenPrompt === i }" :aria-pressed="chosenPrompt === i" @click="chosenPrompt = i">{{ pr }}</button>
        <button type="button" class="opt write-own" @click="writingOwn = true; chosenPrompt = null">✎ Write your own</button>
      </div>
      <div v-else class="own-wrap">
        <textarea v-model="customPrompt" class="answer-input" rows="3" maxlength="160" :placeholder="turn.mode === 'share' ? 'Show us...' : 'Ask them...'" aria-label="Your prompt" />
        <button type="button" class="link-btn" @click="writingOwn = false; customPrompt = ''">Back to the suggestions</button>
      </div>
      <button class="btn btn-primary btn-block btn-lg" :disabled="writingOwn ? !customPrompt.trim() : chosenPrompt == null" @click="sendPrompt">Send it to {{ turn.target?.name }}</button>
    </template>

    <!-- TARGET: respond (truth = text, share = photo) -->
    <template v-else-if="amTarget && phase === 'respond' && !responseSent">
      <div class="kicker">{{ turn.pickerName }} asks you</div>
      <h2 class="q">{{ turn.prompt }}</h2>
      <template v-if="turn.mode === 'share'">
        <div v-if="photo" class="photo-preview">
          <img :src="photo" alt="Your photo" />
        </div>
        <label class="btn btn-ghost btn-block photo-btn">
          {{ compressing ? 'Processing…' : photo ? 'Pick a different photo' : 'Choose or snap a photo' }}
          <input type="file" accept="image/*" capture="environment" class="visually-hidden" @change="onPhotoPick" />
        </label>
        <p class="hint">Only what you choose is shared, and it shows on the big screen, not saved anywhere.</p>
        <button class="btn btn-primary btn-block btn-lg" :disabled="!photo || compressing" @click="sendPhoto">Show the room</button>
      </template>
      <template v-else>
        <textarea v-model="answer" class="answer-input" rows="4" maxlength="280" placeholder="Your answer..." aria-label="Your answer" />
        <button class="btn btn-primary btn-block btn-lg" :disabled="!answer.trim()" @click="sendTruth">Answer</button>
      </template>
      <button class="btn btn-ghost btn-block" @click="pass">Pass (no penalty)</button>
    </template>

    <!-- REACT (everyone but the target) -->
    <template v-else-if="phase === 'react' && !amTarget">
      <div class="kicker">{{ turn.target?.name }} {{ turn.hasPhoto ? 'shared a photo' : 'answered' }}</div>
      <blockquote v-if="!turn.hasPhoto" class="answer">{{ turn.response }}</blockquote>
      <p v-else class="screen-hint">Look at the big screen!</p>
      <h2 class="q">How'd they do?</h2>
      <div class="reacts">
        <button v-for="k in REACTION_KINDS" :key="k" type="button" class="react" :class="[k, { on: myReaction === k }]" :aria-pressed="myReaction === k" @click="react(k)">{{ REACTION_LABELS[k] }}</button>
      </div>
      <p v-if="myReaction" class="hint">Reaction in. Tap another to change it.</p>
    </template>

    <!-- waiting / status states -->
    <div v-else-if="phase === 'result'" class="big">
      <h2 v-if="turn.passed">Pass taken</h2>
      <h2 v-else>Nice one!</h2>
      <p v-if="!turn.passed">{{ turn.target?.name }} drew {{ turn.reactions?.total ?? 0 }} {{ (turn.reactions?.total ?? 0) === 1 ? 'reaction' : 'reactions' }}.</p>
      <p>Watch the big screen for what's next.</p>
    </div>
    <div v-else-if="amTarget && phase === 'react'" class="big">
      <h2>You're up on the screen</h2>
      <p>The room is reacting{{ turn.hasPhoto ? ' to your photo' : '' }}.</p>
    </div>
    <div v-else-if="amTarget && responseSent" class="big">
      <h2>Sent</h2>
      <p>It's on the big screen now.</p>
    </div>
    <div v-else-if="amPicker && (pickSent || promptSent)" class="big">
      <h2>Good call</h2>
      <p>Watch the big screen.</p>
    </div>
    <div v-else class="big">
      <h2>Watch the big screen</h2>
      <p v-if="phase === 'pick'">{{ turn.pickerName }} is choosing who's next.</p>
      <p v-else-if="phase === 'mode'">{{ turn.target?.name }} is deciding: truth or share?</p>
      <p v-else-if="phase === 'prompt'">{{ turn.pickerName }} is picking a {{ turn.mode === 'share' ? 'photo to ask for' : 'question' }}.</p>
      <p v-else-if="phase === 'respond'">{{ turn.target?.name }} is {{ turn.mode === 'share' ? 'lining up a photo' : 'answering' }}.</p>
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
  font: inherit; font-weight: 700; padding: 14px 18px; border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft); background: var(--surface-2); color: var(--ink);
  cursor: pointer; box-shadow: var(--shadow-sm);
}
.opt.prompt { text-align: left; }
.opt.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, var(--surface-2)); }
.write-own { border-style: dashed; color: var(--ink-soft); }
.own-wrap { display: flex; flex-direction: column; gap: 8px; }
.link-btn { align-self: flex-start; background: none; border: none; color: var(--primary); font: inherit; font-weight: 700; font-size: 13px; cursor: pointer; text-decoration: underline; }
/* Truth / Share choice */
.mode-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.mode {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  font: inherit; padding: 22px 14px; border-radius: var(--radius-lg);
  border: 3px solid var(--line); background: var(--surface); color: var(--ink);
  cursor: pointer; box-shadow: var(--shadow-sm); transition: transform 0.06s ease, border-color 0.12s;
}
.mode:active { transform: scale(0.97); }
.mode-truth { border-color: var(--c5); }
.mode-share { border-color: var(--primary); }
.mode-t { font-weight: 900; font-size: clamp(20px, 6vw, 26px); }
.mode-d { font-size: 13px; color: var(--ink-soft); text-align: center; line-height: 1.35; }
.answer-input {
  width: 100%; resize: none; font: inherit; font-size: clamp(16px, 4.5vw, 20px); font-weight: 600;
  color: var(--ink); background: var(--surface-2); border: var(--bd) solid var(--line-soft);
  border-radius: var(--radius); padding: 14px;
}
.answer-input:focus { outline: none; border-color: var(--primary); }
.photo-preview { border-radius: var(--radius); overflow: hidden; border: var(--bd) solid var(--line); }
.photo-preview img { display: block; width: 100%; max-height: 280px; object-fit: contain; background: var(--surface-2); }
.photo-btn { position: relative; }
.visually-hidden { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.answer {
  margin: 0; background: var(--surface-2); border: var(--bd) solid var(--line); border-left: 5px solid var(--primary);
  border-radius: var(--radius); padding: 16px 18px; font-weight: 700; font-size: clamp(17px, 4.5vw, 22px); line-height: 1.35;
}
.screen-hint { text-align: center; font-weight: 700; color: var(--ink-soft); }
.reacts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.react {
  font: inherit; font-weight: 800; font-size: clamp(18px, 5vw, 24px); padding: 18px; border-radius: var(--radius-lg);
  border: 3px solid var(--line); background: var(--surface); color: var(--ink); cursor: pointer; box-shadow: var(--shadow-sm);
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
