<script setup lang="ts">
// Hosts a SESSION (several games back to back in one room). This explicit route
// takes precedence over /host/[plugin] so "session" is never treated as a game id.
useDootSeo({ title: 'Host a session', description: 'Play a night of Doot games back to back in one room.' })
</script>

<template>
  <ClientOnly>
    <SessionHostRoom />
    <template #fallback>
      <div class="boot">Setting up the session…</div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  min-height: 100vh;
  color: var(--ink-soft);
}
</style>
