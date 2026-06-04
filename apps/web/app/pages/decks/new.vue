<script setup lang="ts">
/** Build a new library deck. Requires a session (saving is gated). */
import { computed } from 'vue'

const session = authClient.useSession()
const loggedIn = computed(() => !!session.value?.data?.user)
</script>

<template>
  <main>
    <div class="wrap">
      <section class="section editor-section" style="padding-top: 34px">
        <div class="section-head" style="margin-bottom: 18px">
          <div><span class="kicker">Content library</span><h2>New deck</h2></div>
          <NuxtLink to="/decks" class="btn btn-ghost btn-sm">← All decks</NuxtLink>
        </div>
        <div v-if="!loggedIn" class="empty">
          <p><NuxtLink to="/login" class="explore-link">Log in</NuxtLink> to build and save decks.</p>
        </div>
        <DeckEditor v-else />
      </section>
    </div>
  </main>
</template>

<style scoped>
.editor-section { max-width: 1000px; }
.empty { color: var(--ink-soft); padding: 24px 0; line-height: 1.5; }
.explore-link { color: var(--primary); font-weight: 700; }
</style>
