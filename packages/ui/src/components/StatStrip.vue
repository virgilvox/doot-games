<script setup lang="ts">
/** A row of headline stat cards. Reads the SDK's StatItem shape. */
interface Stat {
  label: string
  value: string | number
}
withDefaults(
  defineProps<{
    stats: Stat[]
    /** Tight enough to sit under a full-height board. The strip is the run's footnote,
     *  not its headline, and on the host it competes for vertical space with the thing
     *  people are actually reading. */
    compact?: boolean
  }>(),
  { compact: false },
)
</script>

<template>
  <div class="statrow" :class="{ compact }">
    <div v-for="(s, i) in stats" :key="i" class="stat panel">
      <div class="sv">{{ s.value }}</div>
      <div class="sl">{{ s.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.statrow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}
.stat {
  padding: 16px;
  text-align: center;
}
.sv {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 34px;
  color: var(--c1);
}
.sl {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--mute);
  margin-top: 2px;
}
/* Compact: one line of number + label, so a wide strip of tallies costs ~50px
   instead of ~120px of a screen the board needs. */
.statrow.compact {
  gap: 8px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.statrow.compact .stat {
  padding: 7px 12px;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}
.statrow.compact .sv {
  font-size: 22px;
}
.statrow.compact .sl {
  margin-top: 0;
}
</style>
