<script setup lang="ts">
/**
 * Hosts a SESSION: several games played back to back in one room (a "night of
 * games"). Players join once and stay for all of them; between games the room
 * keeps a cumulative session leaderboard (placement points per game). Client-only.
 *
 * It reuses the generic per-game machinery (resolve config -> wire derive/assign/
 * reveal -> LoadedGame) for each leg, renders the standard GameHost in `sessionMode`
 * (so the game's own "play again" CTA is hidden), and drives the next leg with the
 * engine's `room.host.nextGame`. Custom-flow games (their own Host + /x/ state) are
 * excluded, since nextGame only resets the engine, not their bespoke state.
 */
import { type RelayValue, type RoomMeta, createClaspRelay, makeRoomCode } from '@doot-games/engine'
import { provideDootRoom, useDootRoom } from '@doot-games/engine/vue'
import {
  GameHost,
  buildAssignContent,
  buildDeriveContent,
  buildRevealSummary,
  buildTimerFor,
  gameAnswerKeys,
  gameRounds,
  getPlugin,
  listPlugins,
  redactGameConfig,
  resolveComposition,
} from '@doot-games/games'
import type { GamePlugin, ScorePlayer, StandardResults } from '@doot-games/sdk'
import { DootLogo, Stage } from '@doot-games/ui'
import { computed, onMounted, reactive, ref, watch } from 'vue'

// `gameIds`: a saved playlist's lineup (from /host/playlist/[id]); when given, the
// picker is skipped and the session starts on that lineup.
const props = defineProps<{ gameIds?: string[] }>()
const runtime = useRuntimeConfig()
const themeState = useState<string>('doot-theme', () => 'doot')
const themeId = themeState.value

const roomCode = makeRoomCode()
const relay = createClaspRelay(runtime.public.relayUrl as string, { name: 'doot-session-host' })
const room = useDootRoom({ relay, room: roomCode, role: 'host' })
provideDootRoom(room)

const getPlayers = (): ScorePlayer[] =>
  room.runtime.recentPlayers().map((p) => ({ id: p.id, name: p.name, joinedAtIndex: p.joinedAtIndex, team: p.team }))

/** The generic (non-custom-flow) flagship games a session can sequence. */
const candidates = listPlugins()
  .filter((p) => p.manifest.flagship && !p.components?.Host)
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))

const picks = ref<string[]>([])
const idx = ref(-1) // -1 = setup; 0..n-1 = the current leg
const finished = ref(false)
const captured = ref(-1) // the last leg whose results were folded into the session
const sessionScores = reactive(new Map<string, { name: string; points: number }>())

const currentPlugin = computed<GamePlugin | undefined>(() =>
  idx.value >= 0 && idx.value < picks.value.length ? getPlugin(picks.value[idx.value]!) : undefined,
)
const sessionBoard = computed(() =>
  [...sessionScores.entries()]
    .map(([id, v]) => ({ id, name: v.name, points: v.points }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
)

/** Build a full LoadedGame for one plugin (config + the two-phase wiring). */
function buildLoaded(plugin: GamePlugin) {
  const base = plugin.buildConfig ? plugin.buildConfig(roomCode) : plugin.defaultConfig
  const config = resolveComposition(plugin, base, roomCode)
  const meta: RoomMeta = {
    pluginId: plugin.manifest.id,
    pluginVersion: plugin.manifest.version,
    title: config.title || plugin.manifest.name,
    themeId,
  }
  return {
    meta,
    config: config as unknown as RelayValue,
    publishConfig: redactGameConfig(plugin, config) as unknown as RelayValue,
    rounds: gameRounds(plugin, config),
    // Read-time scaling for derived judge galleries (mirrors HostRoom).
    timerFor: buildTimerFor(plugin, config) as never,
    answerKeys: gameAnswerKeys(plugin, config) as unknown as Record<number, RelayValue>,
    deriveContent: buildDeriveContent(plugin, config, roomCode, getPlayers, (i) => room.answerKeyFor(i)) as never,
    assignContent: buildAssignContent(plugin, config, roomCode, getPlayers, (i) => room.answerKeyFor(i)) as never,
    revealSummary: buildRevealSummary(
      plugin,
      config,
      getPlayers,
      (i) => room.runtimeContentFor(i),
      (i) => room.answerKeyFor(i),
      // P4B: fold the crowd into the published reveal tally when the toggle is on, so the
      // big screen + phones match the scored result in a session too (mirrors HostRoom).
      (i) => (room.meta.value?.crowdCounts ? (room.audienceVotesFor(i) as Map<string, unknown>) : new Map()),
    ) as never,
  }
}

function toggle(id: string) {
  const i = picks.value.indexOf(id)
  if (i >= 0) picks.value.splice(i, 1)
  else picks.value.push(id)
}

function startSession() {
  if (!picks.value.length) return
  idx.value = 0
  const plugin = currentPlugin.value
  if (plugin) room.host.loadGame(buildLoaded(plugin) as never)
}

// A saved playlist: keep only games this session can sequence (known + generic), in
// the saved order, and start straight away (skipping the picker).
onMounted(() => {
  const ids = (props.gameIds ?? []).filter((id) => candidates.some((c) => c.manifest.id === id))
  if (ids.length) {
    picks.value = ids
    startSession()
  }
})

// Save the current lineup as a reusable playlist (needs a login, like saving a game).
const saveName = ref('')
const savedId = ref('')
const saveError = ref('')
async function saveLineup() {
  if (!picks.value.length) return
  saveError.value = ''
  try {
    const r = await $fetch<{ id: string }>('/api/playlists', {
      method: 'POST',
      body: { name: saveName.value.trim() || 'My session', games: picks.value },
    })
    savedId.value = r.id
  } catch (e) {
    saveError.value = (e as { statusCode?: number })?.statusCode === 401 ? 'Log in to save a lineup.' : 'Could not save.'
  }
}

/** Placement points for one game's leaderboard: 1st 5, 2nd 3, 3rd 2, the rest 1
 *  (only players who actually scored). Folded once per leg. */
function foldResults() {
  const results = room.results.value as StandardResults | undefined
  const lb = (results?.leaderboard ?? []).filter((e) => (e.score ?? 0) > 0).sort((a, b) => b.score - a.score)
  lb.forEach((e, rank) => {
    if (!e.id) return
    const pts = rank === 0 ? 5 : rank === 1 ? 3 : rank === 2 ? 2 : 1
    const cur = sessionScores.get(e.id) ?? { name: e.name, points: 0 }
    sessionScores.set(e.id, { name: e.name, points: cur.points + pts })
  })
}

// Fold the leg's scores into the session the moment its results land (once per leg),
// so the between-games bar shows up-to-date session standings.
watch(
  () => room.phase.value,
  (ph) => {
    if (ph === 'results' && idx.value >= 0 && captured.value !== idx.value) {
      foldResults()
      captured.value = idx.value
    }
  },
)

function advance() {
  if (idx.value < picks.value.length - 1) {
    idx.value += 1
    const plugin = currentPlugin.value
    if (plugin) room.host.nextGame(buildLoaded(plugin) as never)
  } else {
    finished.value = true
  }
}

const atResults = computed(() => room.phase.value === 'results')
const isLastGame = computed(() => idx.value >= picks.value.length - 1)
const playerCount = computed(() => room.players.value.length)
</script>

<template>
  <Stage>
    <template #bar>
      <NuxtLink to="/" class="home-link" aria-label="Doot home"><DootLogo :size="40" /></NuxtLink>
      <div class="bar-right">
        <span v-if="idx >= 0 && !finished" class="chip">Game {{ idx + 1 }}/{{ picks.length }}</span>
        <span class="chip">{{ playerCount }} {{ playerCount === 1 ? 'player' : 'players' }}</span>
        <span class="code mono">{{ roomCode }}</span>
      </div>
    </template>

    <!-- SETUP: pick the games -->
    <div v-if="idx === -1" class="setup">
      <h1>Build your session</h1>
      <p class="lead">Pick the games to play back to back. Everyone joins once and stays for the whole night.</p>
      <div class="picks" role="group" aria-label="Pick games">
        <button
          v-for="p in candidates"
          :key="p.manifest.id"
          type="button"
          class="pick"
          :class="{ on: picks.includes(p.manifest.id) }"
          :aria-pressed="picks.includes(p.manifest.id)"
          @click="toggle(p.manifest.id)"
        >
          <span class="pick-name">{{ p.manifest.name }}</span>
          <span v-if="picks.includes(p.manifest.id)" class="pick-order mono">{{ picks.indexOf(p.manifest.id) + 1 }}</span>
        </button>
      </div>
      <button type="button" class="btn btn-primary btn-lg start" :disabled="!picks.length" @click="startSession">
        Start session ({{ picks.length }} {{ picks.length === 1 ? 'game' : 'games' }})
      </button>
      <div v-if="picks.length" class="save-row">
        <template v-if="!savedId">
          <input v-model="saveName" class="save-input" maxlength="120" placeholder="Name this lineup (optional)" aria-label="Lineup name" />
          <button type="button" class="btn btn-ghost" @click="saveLineup">Save lineup</button>
          <span v-if="saveError" class="save-err">{{ saveError }}</span>
        </template>
        <p v-else class="save-ok">Saved. Host it any time at <a :href="`/host/playlist/${savedId}`" class="mono">/host/playlist/{{ savedId }}</a></p>
      </div>
    </div>

    <!-- DONE: the final session leaderboard -->
    <div v-else-if="finished" class="session-done">
      <div class="kicker">That's a night</div>
      <h1>Session champions</h1>
      <ol class="session-board big">
        <li v-for="(e, i) in sessionBoard" :key="e.id" :class="{ win: i === 0 }">
          <span class="sb-rank mono">{{ i + 1 }}</span>
          <span class="sb-name">{{ e.name }}</span>
          <span class="sb-pts mono">{{ e.points }}</span>
        </li>
      </ol>
      <p v-if="!sessionBoard.length" class="lead">Nobody put points on the board. Run it back!</p>
      <a class="btn btn-primary btn-lg" href="/">Home</a>
    </div>

    <!-- PLAYING: the current game + (at results) the session bar -->
    <template v-else-if="currentPlugin">
      <GameHost :plugin="currentPlugin" :session-mode="true" />
      <div v-if="atResults" class="session-bar">
        <div class="sb-standings" aria-label="Session standings">
          <span class="sb-label">Session</span>
          <span v-for="(e, i) in sessionBoard.slice(0, 5)" :key="e.id" class="sb-chip" :class="{ lead: i === 0 }">
            {{ i + 1 }}. {{ e.name }} <b>{{ e.points }}</b>
          </span>
          <span v-if="!sessionBoard.length" class="sb-chip">No points yet</span>
        </div>
        <button type="button" class="btn btn-primary btn-lg" @click="advance">
          {{ isLastGame ? 'Finish session →' : 'Next game →' }}
        </button>
      </div>
    </template>
  </Stage>
</template>

<style scoped>
.home-link { display: inline-flex; align-items: center; border-radius: 10px; }
.home-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.bar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.chip {
  font-weight: 700; font-size: 13px; border: var(--bd) solid var(--line-soft);
  background: var(--surface); border-radius: 999px; padding: 6px 13px;
}
.code { font-weight: 700; font-size: 22px; letter-spacing: 0.3em; color: var(--primary); padding-left: 0.3em; }

.setup, .session-done {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; text-align: center; padding: 24px;
}
.setup h1, .session-done h1 { font-size: clamp(30px, 6vw, 52px); font-weight: 800; }
.lead { color: var(--ink-soft); max-width: 50ch; line-height: 1.5; }
.kicker { text-transform: uppercase; letter-spacing: 0.1em; font-weight: 800; color: var(--ink-soft); font-size: 13px; }
.picks {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px; width: min(900px, 100%);
}
.pick {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  font: inherit; font-weight: 700; cursor: pointer; text-align: left;
  background: var(--surface-2); border: 2px solid var(--line-soft); border-radius: 14px; padding: 14px 16px;
  transition: border-color 0.1s, transform 0.1s;
}
.pick:hover { transform: translateY(-1px); }
.pick.on { border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, var(--surface-2)); }
.pick-order {
  flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
  background: var(--primary); color: var(--primary-ink); font-weight: 800; font-size: 13px;
}
.start { margin-top: 6px; }
.save-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }
.save-input {
  font: inherit; font-size: 15px; padding: 9px 13px; border-radius: 10px;
  border: var(--bd) solid var(--line-soft); background: var(--surface-2); color: var(--ink); min-width: 240px;
}
.save-err { color: var(--primary); font-weight: 700; font-size: 13px; }
.save-ok { color: var(--ink-soft); font-weight: 600; }
.save-ok a { color: var(--primary); }

.session-bar {
  flex: none; margin-top: 14px; display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap; padding: 12px 16px; border-radius: 16px;
  border: var(--bd) solid var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--surface));
}
.sb-standings { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.sb-label { font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; font-size: 12px; color: var(--ink-soft); }
.sb-chip {
  font-weight: 700; font-size: 14px; background: var(--surface); border: var(--bd) solid var(--line-soft);
  border-radius: 999px; padding: 5px 12px;
}
.sb-chip.lead { border-color: var(--c5); }
.session-board { list-style: none; display: grid; gap: 10px; width: min(560px, 92%); margin: 0; padding: 0; }
.session-board li {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 14px;
  background: var(--surface-2); border: var(--bd) solid var(--line-soft); border-radius: 14px; padding: 14px 18px;
}
.session-board li.win { border-color: var(--c5); background: color-mix(in srgb, var(--c5) 14%, var(--surface-2)); }
.sb-rank { font-weight: 800; color: var(--ink-soft); }
.sb-name { font-family: var(--font-display); font-weight: 800; font-size: clamp(18px, 2.4vw, 24px); overflow-wrap: anywhere; }
.sb-pts { font-weight: 800; font-size: clamp(20px, 2.6vw, 28px); color: var(--c5); }
</style>
