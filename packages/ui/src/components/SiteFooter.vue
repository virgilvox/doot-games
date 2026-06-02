<script setup lang="ts">
/**
 * Site footer (ported from doot-mockup.html's `.footer`): the doot mark, three
 * link columns (Play / Create / About), and a tagline. Links are slots-free and
 * use plain anchors / router links via a small config so it can live in the UI
 * package without depending on the app router.
 */
import DootLogo from './DootLogo.vue'
</script>

<template>
  <footer class="footer">
    <div class="wrap">
      <div class="frow">
        <DootLogo :size="34" />
        <div class="fcol">
          <h5>Play</h5>
          <a href="/explore">Explore games</a>
          <a href="/explore">Trending</a>
          <a href="/explore">New releases</a>
        </div>
        <div class="fcol">
          <h5>Create</h5>
          <a href="/create">Make a game</a>
          <a href="/create">Game types</a>
          <a href="https://github.com/virgilvox/doot-games/blob/main/docs/external-plugins.md" target="_blank" rel="noopener">Link your plugin</a>
        </div>
        <div class="fcol">
          <h5>About</h5>
          <a href="https://github.com/virgilvox/doot-games" target="_blank" rel="noopener">Open source</a>
          <a href="https://github.com/virgilvox/doot-games#deploy" target="_blank" rel="noopener">Self-host</a>
          <a href="https://clasp.to" target="_blank" rel="noopener">Built on CLASP</a>
          <a href="/privacy">Privacy</a>
        </div>
        <div class="fcol">
          <h5>Support</h5>
          <a href="https://ko-fi.com/hackbuild" target="_blank" rel="noopener">Ko-fi</a>
          <a href="https://patreon.com/HackBuild" target="_blank" rel="noopener">Patreon</a>
        </div>
      </div>
      <p class="fnote mono">
        doot.games, a home for collaborative party games. Host on a screen, play on a phone.
        Made by <a href="https://hack.build" target="_blank" rel="noopener" class="fmade">hack.build</a>.
      </p>
    </div>
  </footer>
</template>

<style scoped>
.footer {
  border-top: var(--bd) solid var(--line-soft);
  margin-top: 30px;
  padding: 36px 0;
}
.wrap {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
}
.frow {
  display: flex;
  justify-content: space-between;
  gap: 30px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.fcol h5 {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mute);
  margin: 0 0 12px;
}
.fcol a {
  display: block;
  color: var(--ink-soft);
  font-weight: 600;
  font-size: 14px;
  padding: 4px 0;
  text-decoration: none;
}
.fcol a:hover {
  color: var(--primary);
}
.fnote {
  margin-top: 24px;
  font-size: 13px;
  color: var(--mute);
}
.fmade {
  color: var(--primary);
  font-weight: 700;
  text-decoration: none;
}
.fmade:hover {
  text-decoration: underline;
}
</style>
