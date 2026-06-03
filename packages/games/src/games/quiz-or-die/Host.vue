<script setup lang="ts">
/**
 * QUIZ OR DIE host: the big-screen stage. A thin component that renders the lobby
 * and the cinematic show; all the orchestration (the relay-driven sequencer, the
 * game state, the audio) lives in the `useQuizShow` composable, and the outcome
 * rules in `logic.ts`. This file is just the stage and the lobby controls.
 */
import { injectDootRoom } from '@doot-games/engine/vue'
import type { GamePlugin } from '@doot-games/sdk'
import { ConfettiBurst, DButton, RoomTicket, RosterChips } from '@doot-games/ui'
import { type Ref, computed, inject, ref } from 'vue'
import GameResults from '../../runtime/GameResults.vue'
import { CAST_DEFS, chalice, dieFace, doll, ghostDoll, poisonTok, villain, wheelSVG } from './cast'
import { WHEEL_SECTORS } from './logic'
import { useQuizShow } from './useQuizShow'

defineProps<{ plugin: GamePlugin }>()
const room = injectDootRoom()
const joinUrl = computed(() => {
  const code = room.runtime.room
  return typeof window === 'undefined' ? `/play/${code}` : `${window.location.origin}/play/${code}`
})

// ── Lobby controls (injected from HostRoom) ───────────────────────────────────
const roundConfig = inject<{ min: number; max: number; default: number; label: string; value: number } | null>('dootRoundConfig', null)
const roundChoices = computed(() => {
  if (!roundConfig) return []
  const out: number[] = []
  for (let n = roundConfig.min; n <= roundConfig.max; n++) out.push(n)
  return out
})
const playerCap = inject<Ref<number | null>>('dootPlayerCap', ref(null))
function toggleCap(on: boolean) {
  playerCap.value = on ? 10 : null
}

// The show: orchestration + per-phase render state live in the composable.
const {
  show, caption, villainOn, villainCenter, talking, menacing, confetti, flashKind, shakeOn,
  muted, voiceMode, remaining, sceneClass, exitOn, statusInfo, galleryReveal, pickChips,
  castMap, ROT, KEYC, startGame, playAgain, skip, toggleMute, cycleVoice,
} = useQuizShow()
</script>

<template>
  <!-- LOBBY -->
  <div v-if="room.phase.value === 'lobby'" class="qod-lobby qod-root">
    <section class="panel ticket-card">
      <RoomTicket :code="room.runtime.room" :url="joinUrl" />
    </section>
    <section class="panel roster-card">
      <div class="lobby-head">
        <h2 class="lobby-title">{{ plugin.manifest.name }}</h2>
        <p class="lobby-desc">{{ plugin.manifest.description }}</p>
      </div>
      <div class="roster-head">
        <div class="kicker">The condemned</div>
        <span class="count mono">{{ room.players.value.length }} checked in</span>
      </div>
      <RosterChips :players="room.players.value" />
      <div v-if="roundConfig" class="round-pick">
        <span class="kicker">{{ roundConfig.label }}</span>
        <div class="round-opts" role="group" :aria-label="roundConfig.label">
          <button v-for="n in roundChoices" :key="n" type="button" class="round-opt" :class="{ on: roundConfig.value === n }" :aria-pressed="roundConfig.value === n" @click="roundConfig.value = n">{{ n }}</button>
        </div>
      </div>
      <div class="cap-pick">
        <label class="cap-row">
          <input type="checkbox" :checked="playerCap != null" @change="toggleCap(($event.target as HTMLInputElement).checked)" />
          <span class="kicker">Limit how many can join</span>
        </label>
      </div>
      <div class="lobby-actions">
        <DButton variant="primary" size="lg" :disabled="room.players.value.length < 2" @click="startGame">Enter the house</DButton>
      </div>
      <p class="note">Answer trivia on your phone. Get it wrong and you are dragged to the Cellar for a game of chance. The dead play on as ghosts. Best experienced loud. You need at least two players.</p>
    </section>
  </div>

  <!-- RESULTS -->
  <div v-else-if="room.phase.value === 'results' && room.results.value" class="qod-results qod-root">
    <GameResults :results="room.results.value as any" />
    <div class="results-next">
      <button type="button" class="btn btn-primary btn-lg" @click="playAgain">Run it again</button>
      <a class="btn btn-ghost btn-lg" href="/explore">Pick another game</a>
    </div>
  </div>

  <!-- THE SHOW: a 16:9 cinematic stage with layered, absolutely-placed scene /
       gallery / centre / host / HUD / captions, faithful to the mockup. -->
  <div v-else class="qod-show qod-root">
    <div class="qod-stage" :class="[sceneClass, { shake: shakeOn }]">
      <div class="scene"><div class="floor" /></div>
      <div class="qod-defs" v-html="CAST_DEFS" />

      <!-- gallery (top doll row) -->
      <div class="gallery">
        <div v-for="p in show?.cast ?? []" :key="p.pid" class="gp" :class="{ dead: !p.alive, atrisk: p.atRisk && p.alive }">
          <div class="gname" :style="{ color: p.alive ? p.color : '#9fb6b2' }">{{ p.name }}</div>
          <div class="gmoney">${{ p.money }}</div>
          <div class="gdoll idlebob" v-html="p.alive ? doll(p.shape, p.color) : ghostDoll(p.color)" />
        </div>
      </div>

      <!-- centre stage -->
      <div class="stageMain" :class="`phase-${show?.phase ?? ''}`">
        <!-- intro -->
        <template v-if="show?.phase === 'intro'">
          <div class="big-amber pop-in">QUIZ<i class="big-blood">OR DIE</i></div>
          <div class="subtle rise">room {{ room.runtime.room }} · {{ (show?.cast ?? []).length }} contestants checked in</div>
        </template>

        <!-- question / reveal -->
        <template v-else-if="show?.phase === 'question' || show?.phase === 'reveal'">
          <div class="label rise">QUESTION {{ (show?.question?.qIndex ?? 0) + 1 }} &middot; CATEGORY</div>
          <div class="big-blood cat rise">{{ show?.question?.cat }}</div>
          <h2 class="q-title rise">{{ show?.question?.q }}</h2>
          <div class="answers">
            <div v-for="(opt, i) in show?.question?.a ?? []" :key="i" class="ans-wrap rise" :style="{ '--rot': `${ROT[i % 4]}deg`, animationDelay: `${i * 0.07}s` }">
              <div class="ans" :class="{ correct: galleryReveal && galleryReveal.correct === i, wrong: galleryReveal && galleryReveal.correct !== i && pickChips(i).length }" :data-n="i + 1" :style="{ '--key': KEYC[i % 4] }">{{ opt }}</div>
              <div class="picks">
                <span v-for="c in pickChips(i)" :key="c.pid" class="pchip" :style="{ background: c.color }">{{ c.name.slice(0, 2) }}</span>
              </div>
            </div>
          </div>
        </template>

        <!-- cellar minigames -->
        <template v-else-if="show?.phase === 'cellar' && show?.cellar">
          <template v-if="show.cellar.step === 'intro'">
            <div class="big-blood cat">THE CELLAR</div>
            <div class="label">where wrong answers come to rest</div>
          </template>
          <!-- chalice -->
          <template v-else-if="show.cellar.game === 'chalice'">
            <h2 class="q-title">Last Call</h2>
            <div class="label">{{ show.cellar.atRisk.length }} on the floor &middot; some cups are poisoned</div>
            <div class="cups">
              <div v-for="i in show.cellar.cups ?? 0" :key="i" class="cup" :class="{ poisoned: show.cellar.poison?.includes(i - 1), dim: show.cellar.step === 'reveal' && !show.cellar.poison?.includes(i - 1) }">
                <div v-if="show.cellar.poison?.includes(i - 1)" class="tok" v-html="poisonTok()" />
                <div v-html="chalice(i - 1)" />
              </div>
            </div>
          </template>
          <!-- wheel -->
          <template v-else-if="show.cellar.game === 'wheel'">
            <h2 class="q-title">The Reaper's Wheel</h2>
            <div class="label">five-in-six says you lose</div>
            <div class="wheelwrap">
              <div class="wheel-ptr" />
              <div class="wheel" :style="{ transform: `rotate(${show.cellar.wheelDeg ?? 0}deg)` }" v-html="wheelSVG(WHEEL_SECTORS)" />
              <div class="wheel-hub" />
            </div>
            <div class="label sub">{{ castMap.get(show.cellar.activePid ?? '')?.name ?? '' }}, give it a spin&hellip;</div>
          </template>
          <!-- dice -->
          <template v-else-if="show.cellar.game === 'dice'">
            <h2 class="q-title">Bone Dice</h2>
            <div class="dicerow">
              <div v-for="(n, i) in show.cellar.house ?? []" :key="i" class="die" v-html="dieFace(n)" />
            </div>
            <div class="big-blood cat sm">Total {{ show.cellar.target }} &mdash; roll {{ show.cellar.higher ? 'HIGHER' : 'LOWER' }} to live</div>
          </template>
          <!-- money -->
          <template v-else>
            <h2 class="q-title">Blood Money</h2>
            <div class="cash">$ $ $</div>
            <div class="subtle">Take it&hellip; and you might be the only one who does.</div>
          </template>
        </template>

        <!-- death -->
        <div v-else-if="show?.phase === 'death' && show?.death" class="death">
          <div class="death-doll rise" v-html="ghostDoll(castMap.get(show.death.pid)?.color)" />
          <div class="big-blood pop-in">{{ show.death.name.toUpperCase() }} DIED</div>
          <div class="label">cause of death: {{ show.death.you }}</div>
        </div>

        <!-- ending -->
        <div v-else-if="show?.phase === 'ending'" class="ending">
          <div v-if="show?.ending?.result === 'won'" class="big-amber pop-in win">{{ castMap.get(show?.ending?.survivors?.[0] ?? '')?.name?.toUpperCase() ?? 'SOMEONE' }} ESCAPED</div>
          <div v-else class="big-blood pop-in">NO SURVIVORS</div>
          <div class="label">{{ show?.ending?.result === 'won' ? 'the sole survivor walks free' : 'the house always wins' }}</div>
        </div>
      </div>

      <!-- finale lane (spans the lower stage; outside stageMain so it can be wide) -->
      <div v-if="show?.phase === 'finale' && show?.finale" class="finale">
        <div v-if="show.finale.cat" class="fin-head">
          <div class="label">THE ESCAPE &middot; CATEGORY {{ show.finale.round }}</div>
          <div class="big-blood cat sm">{{ show.finale.cat }}</div>
          <div class="fin-opts">
            <span v-for="(o, i) in show.finale.opts" :key="i" class="ans fin-ans" :class="{ correct: show.finale.reveal && show.finale.ok?.[i], wrong: show.finale.reveal && !show.finale.ok?.[i] }" :style="{ '--rot': `${ROT[i % 4]}deg`, '--key': KEYC[i % 4] }" :data-n="i + 1">{{ o.t }}</span>
          </div>
          <div class="subtle">tap every answer that <i>belongs</i></div>
        </div>
        <div class="lane">
          <div class="exitdoor" />
          <div class="dark" :style="{ width: `${Math.min(90, show.finale.darkness * 100)}%` }" />
          <div class="track">
            <div v-for="r in show.finale.racers" :key="r.pid" class="runner" :class="{ out: r.out }">
              <div class="rail" />
              <div class="tok" :style="{ left: `${4 + r.x * 84}%` }">
                <div class="tok-doll" v-html="r.alive ? doll(castMap.get(r.pid)?.shape ?? 'blob', castMap.get(r.pid)?.color ?? '#d98aa0') : ghostDoll(castMap.get(r.pid)?.color)" />
                <span class="tok-name" :style="{ color: castMap.get(r.pid)?.color }">{{ r.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- host (centred on stage for the intro, in the wings during play) -->
      <div class="hostStage" :class="{ center: villainCenter, hidden: !villainOn, talking, menace: menacing }" v-html="villain()" />

      <!-- HUD -->
      <div class="hud">
        <div class="roomcode"><span class="rl">ROOM</span><span class="rc">{{ room.runtime.room }}</span></div>
        <div class="exitsign" :class="{ show: exitOn }">EXIT</div>
        <div v-if="statusInfo" class="status show">{{ statusInfo.label }}<span class="scount">{{ statusInfo.count }}</span></div>
        <div v-if="remaining != null" class="clock" :class="{ low: remaining <= 5 }">
          <div class="face"><span class="num">{{ remaining }}</span></div>
        </div>
      </div>

      <!-- captions -->
      <div class="captions" :class="{ show: !!caption }">
        <span class="who">{{ caption?.who }}</span>
        <span class="txt">{{ caption?.text }}</span>
      </div>

      <div class="flash" :class="flashKind" />
      <ConfettiBurst v-if="confetti" />
    </div>

    <!-- host controls, below the stage -->
    <div class="qod-controls">
      <button type="button" class="ctl" @click="skip">Skip &#9658;</button>
      <button type="button" class="ctl" :class="{ off: muted }" @click="toggleMute">{{ muted ? 'Muted' : 'Sound' }}</button>
      <button type="button" class="ctl" @click="cycleVoice">Voice: {{ voiceMode }}</button>
    </div>
  </div>
</template>

<style scoped src="./Host.css"></style>
