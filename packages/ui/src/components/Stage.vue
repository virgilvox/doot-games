<script setup lang="ts">
/** The host big-screen frame: a wide, padded column with an optional top bar. */
</script>

<template>
  <div class="stage-wrap">
    <header v-if="$slots.bar" class="stage-bar">
      <slot name="bar" />
    </header>
    <main class="stage-body">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.stage-wrap {
  max-width: 1180px;
  margin: 0 auto;
  padding: 18px 26px 26px;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}
.stage-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.stage-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
