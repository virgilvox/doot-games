<script setup lang="ts">
/**
 * A compact between-round standings panel (P3): the running leaderboard shown on a
 * phone (your rank) and the big screen between rounds. When teams are on it leads
 * with a one-line team tally. Purely presentational; fed by the host's published
 * standings. Capped + scrollable so it never grows its container.
 */
import { computed } from 'vue'
import { teamColor } from '../visuals'
import Leaderboard from './Leaderboard.vue'

// Local result shapes (ui must not import @doot-games/sdk; it mirrors the SDK's
// StandardResults structurally, exactly as Leaderboard mirrors LeaderboardEntry).
interface LbEntry {
  id?: string
  name: string
  score: number
  detail?: string
}
interface TeamRow {
  team: string
  score: number
  members: number
}
interface ResultsShape {
  leaderboard?: LbEntry[]
  teamLeaderboard?: TeamRow[]
}

const props = withDefaults(
  defineProps<{
    results: ResultsShape
    me?: string | null
    teams?: string[]
    max?: number
    title?: string
    /** Cap on the panel height (CSS length). Phones keep the compact 30vh; the host
     *  big screen passes a taller value so a few full-size rows aren't clipped + made
     *  to scroll (a TV can't scroll). It still caps for very large rooms. */
    maxHeight?: string
  }>(),
  { me: null, teams: () => [], max: 5, title: 'Standings so far', maxHeight: '30vh' },
)

const teamRows = computed(() => props.results.teamLeaderboard ?? [])
function teamTint(team: string, rank: number): string {
  const i = props.teams.indexOf(team)
  return teamColor(i >= 0 ? i : rank)
}
</script>

<template>
  <div class="peek" :style="{ maxHeight }">
    <p class="peek-title">{{ title }}</p>
    <div v-if="teamRows.length" class="peek-teams">
      <span
        v-for="(t, i) in teamRows"
        :key="t.team"
        class="peek-team"
        :style="{ '--team': teamTint(t.team, i) }"
      >
        <span class="peek-dot" aria-hidden="true" />{{ t.team }} <b>{{ t.score }}</b>
      </span>
    </div>
    <Leaderboard
      v-if="(results.leaderboard?.length ?? 0) > 0"
      :entries="results.leaderboard ?? []"
      :highlight="me"
      :max="max"
    />
  </div>
</template>

<style scoped>
.peek {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  /* max-height is set inline from the maxHeight prop (default 30vh). */
  overflow-y: auto;
}
.peek-title {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 12px;
  color: var(--ink-soft);
}
.peek-teams {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.peek-team {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: color-mix(in srgb, var(--team) 14%, var(--surface-2));
  border: var(--bd) solid var(--team);
  border-radius: 999px;
  padding: 4px 12px;
  font-weight: 700;
  font-size: 14px;
}
.peek-team b {
  color: var(--team);
}
.peek-dot {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--team);
}
</style>
