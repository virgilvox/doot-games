<script setup lang="ts">
/**
 * Two robots squaring off for a Circuit Cypher head-to-head matchup. Each side is
 * a {@link RobotRapper} leaning toward the other; the one performing right now
 * raps (mouth + bob) while the other waits. The verse being performed shows in a
 * bubble between them, and at reveal the vote counts appear and the winner is
 * crowned (a crown shape plus color, never color alone). Pure CSS, theme-aware,
 * and governed by the global prefers-reduced-motion reset.
 */
import RobotRapper from './RobotRapper.vue'

withDefaults(
  defineProps<{
    left: { name: string }
    right: { name: string }
    /** The verse currently on the mic (shown in the bubble). */
    verse?: string
    /** Which side is performing now, or null between performances. */
    performing?: 'left' | 'right' | null
    /** True once the vote is in: show counts and crown the winner. */
    revealed?: boolean
    winner?: 'left' | 'right' | 'tie' | null
    votesLeft?: number
    votesRight?: number
    size?: number
  }>(),
  { verse: '', performing: null, revealed: false, winner: null, votesLeft: 0, votesRight: 0, size: 180 },
)
</script>

<template>
  <div class="battle">
    <div class="ring">
      <div
        class="side left"
        :class="{ on: performing === 'left', won: revealed && (winner === 'left' || winner === 'tie'), lost: revealed && winner === 'right' }"
      >
        <span v-if="revealed && (winner === 'left' || winner === 'tie')" class="crown" aria-label="winner">&#128081;</span>
        <RobotRapper :name="left.name" facing="right" :speaking="performing === 'left'" accent="var(--c2)" :size="size" />
        <span v-if="revealed" class="votes mono">{{ votesLeft }}</span>
      </div>

      <div class="vs"><span>VS</span></div>

      <div
        class="side right"
        :class="{ on: performing === 'right', won: revealed && (winner === 'right' || winner === 'tie'), lost: revealed && winner === 'left' }"
      >
        <span v-if="revealed && (winner === 'right' || winner === 'tie')" class="crown" aria-label="winner">&#128081;</span>
        <RobotRapper :name="right.name" facing="left" :speaking="performing === 'right'" accent="var(--primary)" :size="size" />
        <span v-if="revealed" class="votes mono">{{ votesRight }}</span>
      </div>
    </div>

    <p v-if="verse" class="verse" aria-live="polite">{{ verse }}</p>
  </div>
</template>

<style scoped>
.battle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}
.ring {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: clamp(16px, 5vw, 64px);
}
.side {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.side.on {
  transform: translateY(-6px) scale(1.04);
}
.side.lost {
  opacity: 0.5;
}
.side.won {
  transform: scale(1.05);
}
.crown {
  font-size: clamp(28px, 4vw, 44px);
  line-height: 1;
}
.votes {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(22px, 3vw, 34px);
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  padding: 2px 16px;
  box-shadow: var(--shadow-sm);
}
.vs {
  align-self: center;
  display: grid;
  place-items: center;
  width: clamp(44px, 6vw, 64px);
  height: clamp(44px, 6vw, 64px);
  border-radius: 50%;
  background: var(--ink);
  color: var(--bg);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(16px, 2vw, 22px);
  box-shadow: var(--shadow);
}
.verse {
  max-width: 36ch;
  text-align: center;
  white-space: pre-line;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(18px, 2.6vw, 30px);
  line-height: 1.35;
  color: var(--ink);
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 16px 22px;
  box-shadow: var(--shadow);
}
</style>
