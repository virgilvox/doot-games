<script setup lang="ts">
/** Open a saved game in the editor: edit in place (owner) or fork it (others,
 *  when the owner allowed forking). */
import type { GameComposition } from '@doot-games/sdk'

const route = useRoute()
const id = computed(() => String(route.params.id))

interface SavedGame {
  id: string
  pluginId: string
  themeId: string
  visibility: 'private' | 'unlisted' | 'public'
  description: string | null
  tags: string[]
  coverImage: string | null
  forkable: boolean
  config: GameComposition
  isOwner: boolean
}
const { data: game, error } = await useFetch<SavedGame>(() => `/api/games/${id.value}`)
if (error.value || !game.value) {
  throw createError({ statusCode: 404, statusMessage: 'Game not found' })
}
// Only the owner edits in place. Forking is a server-side copy (POST
// /api/games/:id/clone) that lands the forker in the editor as owner of the new
// copy, so a non-owner never opens this editor against someone else's game.
if (!game.value.isOwner) {
  await navigateTo(`/g/${id.value}`)
}
</script>

<template>
  <ClientOnly>
    <GameEditor v-if="game" :initial-game="game" :can-edit="game.isOwner" />
    <template #fallback>
      <div class="boot">Opening the editor…</div>
    </template>
  </ClientOnly>
</template>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  min-height: 60vh;
  color: var(--ink-soft);
}
</style>
