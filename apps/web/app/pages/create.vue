<script setup lang="ts">
import { flagshipGames } from '@doot-games/games/catalog'
import { GameCover, GameTypeIcon } from '@doot-games/ui'

// The Custom builder is the centerpiece: it's the one editor that can mix any round
// type, so it's the headline action (and the home of the markdown importer). The
// other on-ramps support it: remix a finished game, or have Claude write one.

// "Start with one round type" chips: every single round type the builder offers.
// Each opens the CUSTOM builder seeded with one round of that kind, so you can add
// any other type afterwards (never a dead end). Mirrors the editor's "Single rounds"
// list, minus the display-only Title/Slide cards; the most approachable lead.
const ROUND_TYPES = [
  { id: 'guess', name: 'Guess' },
  { id: 'poll', name: 'Poll' },
  { id: 'rate', name: 'Rate' },
  { id: 'rank', name: 'Rank' },
  { id: 'draw', name: 'Draw' },
  { id: 'buzzer', name: 'Buzzer' },
  { id: 'wager', name: 'Wager' },
  { id: 'answer', name: 'Answer' },
  { id: 'ballpark', name: 'Ballpark' },
  { id: 'categories', name: 'Categories' },
  { id: 'survey', name: 'Survey' },
  { id: 'spectrum', name: 'Spectrum' },
  { id: 'tier', name: 'Tier List' },
  { id: 'hivemind', name: 'Hivemind' },
  { id: 'mostlikely', name: 'Most Likely To' },
  { id: 'collect', name: 'Share' },
]

useDootSeo({
  title: 'Create a game on Doot',
  description: 'Build a custom party game from any round types, remix a ready-made one, or let Claude write it for you.',
})
</script>

<template>
  <main>
    <div class="wrap">
      <div class="create-head">
        <span class="kicker">Build something</span>
        <h1>Create a game</h1>
        <p class="lead">
          Hosting is always free and needs no account. <NuxtLink to="/login" class="lead-link">Sign in</NuxtLink> to save
          your game, share a link, and let Claude build for you.
        </p>
      </div>

      <!-- Headline: the custom builder -->
      <NuxtLink to="/editor/custom" class="cbuilder">
        <div class="cb-text">
          <span class="cb-eyebrow">The builder</span>
          <h2>Build a custom game</h2>
          <p>
            Mix any round type into one game: trivia, polls, drawing, write-and-vote, and more. Around thirty round
            types and two-phase recipes, or paste a spec and Doot builds the whole thing at once.
          </p>
          <span class="cb-cta">Open the builder &rarr;</span>
        </div>
        <div class="cb-vis" aria-hidden="true">
          <GameTypeIcon v-for="k in ['guess', 'draw', 'poll', 'rank', 'buzzer', 'rate']" :key="k" :type="k" :size="40" />
        </div>
      </NuxtLink>

      <!-- Quick starts: seed the builder with one round type. All types in one row
           that scrolls sideways, so the full range is browsable without wrapping. -->
      <div class="qstart">
        <span class="qstart-label">Or start with one round type</span>
        <div class="qrow">
          <NuxtLink v-for="t in ROUND_TYPES" :key="t.id" :to="`/editor/custom?seed=${t.id}`" class="qchip">
            <GameTypeIcon :type="t.id" :size="22" />
            <span>{{ t.name }}</span>
          </NuxtLink>
        </div>
      </div>

      <!-- Two supporting on-ramps -->
      <div class="paths2">
        <a href="#ready" class="path path-ready">
          <span class="path-t">Remix a Game From Doot</span>
          <span class="path-d">Start from a finished game and change the questions, prompts, and theme.</span>
        </a>
        <NuxtLink to="/connect" class="path">
          <span class="path-t">Build it with Claude</span>
          <span class="path-d">Connect your own Claude and it writes the game for you, free.</span>
        </NuxtLink>
      </div>

      <section id="ready" class="cg-section">
        <div class="cg-shead">
          <h2>Games From Doot</h2>
          <p>Finished games with rounds already in them. Open one, change what you want, and host it.</p>
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
  max-width: 60ch;
  margin-inline: auto;
  line-height: 1.5;
}
.lead-link {
  color: var(--primary);
  font-weight: 700;
}
/* Headline custom-builder card */
.cbuilder {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 24px;
  align-items: center;
  margin: 26px 0 18px;
  padding: 28px 30px;
  border-radius: var(--radius-lg);
  text-decoration: none;
  color: inherit;
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), var(--surface));
  border: 2px solid color-mix(in srgb, var(--primary) 40%, var(--line));
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s, box-shadow 0.12s;
}
.cbuilder:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--primary) 35%, transparent);
}
.cb-eyebrow {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--primary);
}
.cb-text h2 {
  font-size: clamp(24px, 4vw, 32px);
  font-weight: 800;
  letter-spacing: -0.01em;
  margin: 6px 0 8px;
}
.cb-text p {
  font-size: 15px;
  color: var(--ink-soft);
  line-height: 1.55;
  margin: 0 0 14px;
  max-width: 60ch;
}
.cb-cta {
  display: inline-block;
  font-weight: 800;
  color: var(--primary);
  font-size: 15px;
}
.cb-vis {
  display: grid;
  grid-template-columns: repeat(2, auto);
  gap: 14px;
  padding: 6px;
}
/* Quick-start chips */
.qstart {
  margin: 6px 0 26px;
}
.qstart-label {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-soft);
  margin-bottom: 10px;
}
/* Single row of every round type; scrolls sideways rather than wrapping. */
.qrow {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 8px;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
}
.qchip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: none;
  scroll-snap-align: start;
  padding: 9px 14px 9px 10px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: var(--ink);
  font-weight: 700;
  font-size: 14px;
  transition: transform 0.1s, border-color 0.12s;
}
.qchip:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--primary) 45%, var(--line));
}
/* Two supporting on-ramps */
.paths2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin: 0 0 30px;
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
/* card / card-body / card-title / grid are global (packages/ui styles); these
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
.foot-note {
  text-align: center;
  color: var(--mute);
  font-size: 14px;
  padding: 8px 0 40px;
}
@media (max-width: 640px) {
  .cbuilder {
    grid-template-columns: 1fr;
  }
  .cb-vis {
    grid-template-columns: repeat(6, auto);
    justify-content: start;
  }
}
</style>
