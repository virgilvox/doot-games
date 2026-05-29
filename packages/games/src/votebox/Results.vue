<script setup lang="ts">
/** VoteBox results: leaderboard, top-rated awards, crowd favorite, stats, confetti. */
import { ConfettiBurst, Leaderboard, StatStrip } from '@doot-games/ui'
import type { VoteBoxResults } from './score'

withDefaults(defineProps<{ results: VoteBoxResults; me?: string | null; compact?: boolean }>(), {
  me: null,
  compact: false,
})
</script>

<template>
  <div class="vb-results">
    <ConfettiBurst v-if="!compact" />
    <header class="rhead">
      <div class="kicker">That is a wrap</div>
      <h1>{{ results.headline }}</h1>
    </header>

    <div class="rgrid" :class="{ compact }">
      <section v-if="results.leaderboard.length" class="panel board">
        <h3>Leaderboard</h3>
        <Leaderboard :entries="results.leaderboard" :highlight="me" :max="compact ? 6 : 8" />
      </section>

      <aside v-if="!compact" class="rside">
        <section v-if="results.awards.length" class="panel awards">
          <h3>Top rated</h3>
          <div v-for="(a, i) in results.awards" :key="i" class="award">
            <div>
              <div class="al">{{ a.label }}</div>
              <div class="as">{{ a.subject }}</div>
            </div>
            <div class="av">{{ a.value }}</div>
          </div>
        </section>
        <section v-if="results.favorite" class="panel fave">
          <div class="kicker">Crowd favorite</div>
          <div class="fbig">{{ results.favorite.subject }}</div>
          <div class="fv mono">{{ results.favorite.average.toFixed(1) }} average</div>
        </section>
      </aside>
    </div>

    <StatStrip v-if="!compact" :stats="results.stats" />
  </div>
</template>

<style scoped>
.vb-results {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rhead {
  text-align: center;
}
.rhead h1 {
  font-size: clamp(34px, 7vw, 64px);
  font-weight: 800;
}
.rgrid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 18px;
  align-items: start;
}
.rgrid.compact {
  grid-template-columns: 1fr;
}
.board,
.awards,
.fave {
  padding: 22px;
}
.board h3,
.awards h3 {
  font-size: 22px;
  margin-bottom: 14px;
  color: var(--primary);
}
.rside {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.award {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 13px;
  padding: 12px 15px;
  margin-bottom: 9px;
}
.al {
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 700;
}
.as {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
}
.av {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--c2);
}
.fave {
  text-align: center;
}
.fbig {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(24px, 4vw, 40px);
  margin-top: 6px;
}
.fv {
  color: var(--ink-soft);
  margin-top: 6px;
}
</style>
