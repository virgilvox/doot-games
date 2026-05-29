<script setup lang="ts">
/** The player phone frame: a narrow centered column with an optional banner. */
</script>

<template>
  <div class="phone-shell">
    <div v-if="$slots.banner" class="banner-slot">
      <slot name="banner" />
    </div>
    <header v-if="$slots.top" class="phone-top">
      <slot name="top" />
    </header>
    <main class="phone-body panel">
      <slot />
    </main>
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
.phone-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
}
</style>
