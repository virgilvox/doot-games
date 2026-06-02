<script setup lang="ts">
import { flagshipGames, templateGames } from '@doot-games/games/catalog'
import { GameTypeIcon } from '@doot-games/ui'

// Two on-ramps, never a blank page: remix a fully-made Doot game (it opens in the
// editor already filled with example rounds), or start from a simple block and add
// your own content. Both route to `/editor/{id}`, which seeds the type's default
// composition — rich for flagships, a starter template for blocks.
</script>

<template>
  <main>
    <div class="wrap">
      <div class="create-head">
        <span class="kicker">Build something</span>
        <h1>Create</h1>
        <p>
          Start from a <b>ready-made game</b> and make it yours, or <b>build from a block</b> and add your own
          questions, prompts, or images. Rather describe it in words? In the editor, hit <b>Import</b> to paste a
          short spec, or copy a one-click prompt and have an AI assistant write it. No account needed to host; you
          only sign in to save a shareable link.
        </p>
      </div>

      <section class="cg-section">
        <div class="cg-shead">
          <h2>Remix a ready-made game</h2>
          <p>Fully-made games from Doot. Each opens in the editor already filled with example rounds — tweak the content and theme, then host.</p>
        </div>
        <div class="typegrid">
          <NuxtLink v-for="t in flagshipGames" :key="t.id" :to="`/editor/${t.id}`" class="typecard flagship">
            <div class="tc-top">
              <GameTypeIcon :type="t.id" :size="48" />
              <span class="tc-badge">Ready to play</span>
            </div>
            <h3>{{ t.name }}</h3>
            <p>{{ t.description }}</p>
            <div class="tfoot">
              <span class="cap mono">v{{ t.version }} · comes pre-filled</span>
              <span class="btn btn-primary btn-sm">Remix this</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="cg-section">
        <div class="cg-shead">
          <h2>Build from a block</h2>
          <p>Start from a single round type and add your own content. <b>Custom</b> mixes any blocks in one game, or paste a markdown spec to build the whole thing at once.</p>
        </div>
        <div class="typegrid">
          <NuxtLink v-for="t in templateGames" :key="t.id" :to="`/editor/${t.id}`" class="typecard">
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
    </div>
  </main>
</template>

<style scoped>
.create-head {
  text-align: center;
  padding: 40px 0 8px;
}
.create-head h1 {
  font-size: clamp(32px, 6vw, 46px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 8px;
}
.create-head p {
  font-size: 18px;
  color: var(--ink-soft);
  margin-top: 12px;
  max-width: 60ch;
  margin-inline: auto;
}
.cg-section {
  padding: 18px 0 8px;
}
.cg-shead {
  padding: 8px 0 4px;
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
/* Ready-made games read as "complete" — a warmer surface + a badge. */
.typecard.flagship {
  background: color-mix(in srgb, var(--primary) 5%, var(--surface));
  border-color: color-mix(in srgb, var(--primary) 35%, var(--line));
}
.tc-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tc-badge {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--primary-ink);
  background: var(--primary);
  border-radius: 999px;
  padding: 4px 10px;
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
</style>
