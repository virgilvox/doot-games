<script setup lang="ts">
/** Generic results page: renders whatever fragments the blocks contributed. */
import type { StandardResults } from '@doot-games/sdk'
import { ConfettiBurst, Leaderboard, StatStrip, VoteBars } from '@doot-games/ui'

const props = withDefaults(
  defineProps<{ results: StandardResults; me?: string | null; compact?: boolean }>(),
  { me: null, compact: false },
)

function bars(d: NonNullable<StandardResults['distributions']>[number]) {
  const total = d.bars.reduce((s, b) => s + b.count, 0) || 1
  return d.bars.map((b) => ({
    label: b.label,
    value: b.count,
    max: total,
    note: `${b.count} vote${b.count === 1 ? '' : 's'}`,
  }))
}
const hasLeaderboard = props.results.leaderboard && props.results.leaderboard.length > 0
const hasAwards = props.results.awards && props.results.awards.length > 0
</script>

<template>
  <div class="results">
    <ConfettiBurst v-if="!compact" />
    <header class="rhead">
      <div class="kicker">That is a wrap</div>
      <h1>{{ results.headline }}</h1>
    </header>

    <div class="rgrid">
      <section v-if="hasLeaderboard" class="panel board">
        <h3>Leaderboard</h3>
        <Leaderboard :entries="results.leaderboard ?? []" :highlight="me" :max="compact ? 6 : 8" />
      </section>

      <section v-if="hasAwards" class="panel awards">
        <h3>Top rated</h3>
        <div v-for="(a, i) in results.awards" :key="i" class="award">
          <div>
            <div class="al">{{ a.label }}</div>
            <div class="as">{{ a.subject }}</div>
          </div>
          <div v-if="a.value != null" class="av">{{ a.value }}</div>
        </div>
      </section>

      <section v-for="(d, i) in results.distributions" :key="`d${i}`" class="panel dist">
        <h3>{{ d.title }}</h3>
        <VoteBars :bars="bars(d)" />
      </section>
    </div>

    <StatStrip v-if="!compact && results.stats" :stats="results.stats" />
  </div>
</template>

<style scoped>
.results {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rhead {
  text-align: center;
}
.rhead h1 {
  font-size: clamp(32px, 7vw, 60px);
  font-weight: 800;
}
.rgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
  align-items: start;
}
.board,
.awards,
.dist {
  padding: 22px;
}
.board h3,
.awards h3,
.dist h3 {
  font-size: 20px;
  margin-bottom: 14px;
  color: var(--primary);
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
</style>
