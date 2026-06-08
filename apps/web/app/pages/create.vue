<script setup lang="ts">
import { flagshipGames, templateGames } from '@doot-games/games/catalog'
import { GameCover, GameTypeIcon } from '@doot-games/ui'
import { computed } from 'vue'

// Custom leads the blocks grid: it's the "mix any blocks" starting point (and the
// home of the markdown importer), so it's the most useful first card. The rest keep
// their catalog order (sort is stable).
const blockTypes = computed(() =>
  [...templateGames].sort((a, b) => (a.id === 'custom' ? -1 : b.id === 'custom' ? 1 : 0)),
)

// Two on-ramps so you never start from nothing. Remix a ready-made game (it opens
// in the editor with example rounds already in place), or build from a single block
// and add your own content. Both route to /editor/{id}. The ready-made games use the
// same GameCover art cards as the home/explore pages; the blocks keep their compact
// icon cards (a clean, uniform grid for the primitives).

useDootSeo({
  title: 'Create a game on Doot',
  description: 'Remix a ready-made party game or build your own from blocks: trivia, polls, drawing, and more.',
})
</script>

<template>
  <main>
    <div class="wrap">
      <div class="create-head">
        <span class="kicker">Build something</span>
        <h1>Create</h1>
        <p class="lead">Two ways to start.</p>
      </div>

      <div class="paths">
        <a href="#ready" class="path path-ready">
          <span class="path-t">Remix a ready-made game</span>
          <span class="path-d">Open a finished Doot game and change the questions, prompts, and theme.</span>
        </a>
        <a href="#blocks" class="path">
          <span class="path-t">Build from blocks</span>
          <span class="path-d">Pick one round type and add your own content, or mix several in Custom.</span>
        </a>
        <NuxtLink to="/connect" class="path">
          <span class="path-t">Build it with Claude</span>
          <span class="path-d">Connect your own Claude and it writes the game for you, free.</span>
        </NuxtLink>
      </div>

      <section id="ready" class="cg-section">
        <div class="cg-shead">
          <h2>Ready-made games</h2>
          <p>These already have rounds in them. Open one, change what you want, and host it.</p>
        </div>
        <div class="grid">
          <NuxtLink v-for="t in flagshipGames" :key="t.id" :to="`/editor/${t.id}`" class="card">
            <GameCover :title="t.name" :type="t.id" />
            <div class="card-body">
              <div class="card-title">{{ t.name }}</div>
              <p class="card-desc">{{ t.description }}</p>
              <span class="card-cta">Remix this &rarr;</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section id="blocks" class="cg-section">
        <div class="cg-shead">
          <h2>Blocks and Custom</h2>
          <p>Pick a round type and add your own content. Custom mixes any blocks in one game, or paste a markdown spec to build a whole game at once.</p>
        </div>
        <div class="typegrid">
          <NuxtLink v-for="t in blockTypes" :key="t.id" :to="`/editor/${t.id}`" class="typecard">
            <GameTypeIcon :type="t.id" :size="48" />
            <h3>{{ t.name }}</h3>
            <p>{{ t.description }}</p>
            <div class="tfoot">
              <span class="cap mono">v{{ t.version }}</span>
              <span class="btn btn-ghost btn-sm">Start building</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <p class="foot-note">No account needed to host. Sign in to save a shareable link.</p>
    </div>
  </main>
</template>

<style scoped>
.create-head {
  text-align: center;
  padding: 40px 0 6px;
}
.create-head h1 {
  font-size: clamp(32px, 6vw, 46px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 8px;
}
.lead {
  font-size: 18px;
  color: var(--ink-soft);
  margin-top: 10px;
}
.paths {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(232px, 1fr));
  gap: 16px;
  margin: 18px 0 30px;
}
.path {
  display: block;
  text-decoration: none;
  color: inherit;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
}
.path:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: color-mix(in srgb, var(--primary) 45%, var(--line));
}
.path-ready {
  background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  border-color: color-mix(in srgb, var(--primary) 35%, var(--line));
}
.path-t {
  display: block;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.path-d {
  display: block;
  font-size: 14px;
  color: var(--ink-soft);
  margin-top: 5px;
  line-height: 1.45;
}
.cg-section {
  padding: 14px 0 6px;
  scroll-margin-top: 80px;
}
.cg-shead h2 {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.cg-shead p {
  font-size: 15px;
  color: var(--ink-soft);
  margin-top: 4px;
  max-width: 70ch;
}
/* card / card-body / card-title / grid are global (packages/ui styles); these two
   match the home and explore pages, which define them per-page. */
.card-desc {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-cta {
  display: inline-block;
  margin-top: 4px;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
/* Blocks keep their compact icon cards (the primitives read best as a uniform,
   art-free grid). */
.typegrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
  padding: 16px 0 32px;
}
.typecard {
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 22px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s, box-shadow 0.12s;
  display: block;
  text-decoration: none;
  color: inherit;
}
.typecard:hover {
  transform: translate(-2px, -3px);
  box-shadow: var(--shadow);
}
.typecard h3 {
  font-size: 23px;
  font-weight: 800;
  margin: 16px 0 7px;
}
.typecard p {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin-bottom: 18px;
  min-height: 62px;
}
.tfoot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.tfoot .cap {
  font-size: 11px;
  color: var(--mute);
  letter-spacing: 0.04em;
}
.foot-note {
  text-align: center;
  color: var(--mute);
  font-size: 14px;
  padding: 8px 0 40px;
}
@media (max-width: 640px) {
  .paths {
    grid-template-columns: 1fr;
  }
}
</style>
