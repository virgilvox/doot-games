<script setup lang="ts">
/**
 * Detail page for a built-in game type (a "Game From Doot" flagship, or a building-
 * block type). Mirrors the saved-game page at /g/[id], but for catalog entries: a
 * big cover, the description, and the actions, host it now on a big screen, or open
 * it in the editor to customize/remix. Clicking a discovery card lands here; the
 * card's own "Host now" affordance still skips straight to /host/<id>.
 */
import { gameCatalog } from '@doot-games/games/catalog'
import { getPlugin } from '@doot-games/games'
import { GameCover } from '@doot-games/ui'
import { computed } from 'vue'

const route = useRoute()
const id = computed(() => String(route.params.id))
const game = computed(() => gameCatalog.find((g) => g.id === id.value) ?? null)
if (!game.value) {
  throw createError({ statusCode: 404, statusMessage: 'Game not found' })
}
// Pool-driven games can be remixed with a creator's own content deck.
const canRemix = computed(() => !!getPlugin(id.value)?.contentPool)

useDootSeo({
  title: `${game.value?.name} on Doot`,
  shareTitle: game.value?.name,
  description:
    game.value?.description ||
    `Play ${game.value?.name} on Doot. Host it on a big screen, everyone joins from their phone.`,
  image: gameOgImage(null, game.value?.id),
  type: 'article',
})
</script>

<template>
  <main>
    <div class="wrap" style="max-width: 760px">
      <article v-if="game" class="detail">
        <div class="detail-cover">
          <GameCover :title="game.name" :type="game.id" ratio="16 / 9" />
        </div>
        <span class="kicker">{{ game.flagship ? 'Game From Doot' : 'Building block' }}</span>
        <h1 class="detail-title">{{ game.name }}</h1>
        <p v-if="game.description" class="detail-desc">{{ game.description }}</p>
        <p class="detail-note">
          Host it on a big screen and players join from their phones with the room code that appears.
          Open it in the editor to remix the rounds and save your own version.
        </p>
        <div class="detail-actions">
          <NuxtLink :to="`/host/${game.id}`" class="btn btn-primary btn-lg">Host now</NuxtLink>
          <RemixWithDeck v-if="canRemix" :plugin-id="game.id" :game-name="game.name" />
          <NuxtLink :to="`/editor/${game.id}`" class="btn btn-ghost btn-lg">Customize &amp; remix</NuxtLink>
          <NuxtLink to="/explore" class="btn btn-ghost btn-lg">Back to games</NuxtLink>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 0 40px;
}
.detail-cover {
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: var(--bd) solid var(--line);
  box-shadow: var(--shadow);
}
.kicker {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
  font-size: 13px;
  margin-top: 4px;
}
.detail-title {
  font-size: clamp(28px, 6vw, 48px);
  font-weight: 900;
  line-height: 1.04;
}
.detail-desc {
  font-size: clamp(16px, 2.4vw, 20px);
  color: var(--ink-soft);
  line-height: 1.5;
}
.detail-note {
  color: var(--mute);
  font-size: 14px;
  line-height: 1.5;
}
.detail-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 10px;
}
</style>
