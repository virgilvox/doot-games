<script setup lang="ts">
/**
 * The player phone frame: a narrow centered column with an optional banner.
 *
 * Also owns the screen dimmer. The host chooses the room's theme and every phone
 * adopts it, so a light theme in a dark venue lands on a phone that is held for
 * an hour. The dimmer is per-player, remembered locally, and never touches the
 * theme, so the room still looks like one room.
 */
import { onMounted, ref, watch } from 'vue'
import { loadDim, saveDim } from '../dim'
import DimToggle from './DimToggle.vue'

// Start bright and adopt the stored choice on mount, so SSR and the first client
// render agree (reading storage during setup would mismatch and flash).
const dim = ref(0)
onMounted(() => {
  dim.value = loadDim()
})
watch(dim, (v) => saveDim(v))
</script>

<template>
  <div class="phone-shell">
    <div v-if="$slots.banner" class="banner-slot">
      <slot name="banner" />
    </div>
    <header v-if="$slots.top" class="phone-top">
      <slot name="top" />
      <DimToggle v-model="dim" class="phone-dim" />
    </header>
    <main class="phone-body panel">
      <slot />
    </main>
    <!-- The dimmer sits above the page and below nothing: it is inert to touch,
         so it dims what the player sees without intercepting a single tap. -->
    <div v-if="dim > 0" class="dim-veil" :style="{ opacity: dim }" aria-hidden="true" />
  </div>
</template>

<style scoped>
.phone-shell {
  max-width: 520px;
  margin: 0 auto;
  padding: 18px 18px 30px;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.phone-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}
/* The dim control is a utility, not part of the player's identity row: let the
   name and connection state take the space first. */
.phone-dim {
  flex: none;
}
.phone-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
}
.dim-veil {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #000;
  pointer-events: none;
  transition: opacity 160ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .dim-veil {
    transition: none;
  }
}
</style>
