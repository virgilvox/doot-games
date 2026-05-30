<script setup lang="ts">
import { DootLogo } from '@doot-games/ui'
</script>

<template>
  <main>
    <div class="wrap support">
      <div class="hero">
        <DootLogo :size="64" />
        <span class="kicker">Support Doot</span>
        <h1>Made with love, <span class="hl">free for everyone</span>.</h1>
        <p class="lead">
          Doot is a labor of love for the community, for fellow nerds, for friends, for
          the rooms full of people who just want to play something together. It's free to
          host and free to play: no player caps, no paywalls, no accounts required.
        </p>
        <p class="lead">
          We keep it that way on purpose. If Doot has made a party, a panel, a classroom,
          or a quiet night in a little better, chipping in helps a lot. It keeps the
          servers running, keeps the games free, lets us actually eat, and frees us up to
          build more things for you to play with.
        </p>
        <div class="cta">
          <a class="btn btn-primary btn-lg" href="https://ko-fi.com/hackbuild" target="_blank" rel="noopener">
            &#9749; Buy us a Ko-fi
          </a>
          <a class="btn btn-ghost btn-lg" href="https://patreon.com/HackBuild" target="_blank" rel="noopener">
            Support on Patreon
          </a>
        </div>
        <p class="madeby">
          Built by <b>Moheeb Zara</b> and <b>Danielle Marie Pereira</b> at
          <a href="https://hack.build" target="_blank" rel="noopener" class="hl-link">hack.build</a>.
          Thank you for being here. &#10084;
        </p>
        <NuxtLink to="/explore" class="back">&larr; Back to the games</NuxtLink>
      </div>
    </div>
  </main>
</template>

<style scoped>
.support {
  display: grid;
  place-items: center;
  min-height: 70vh;
  padding: 40px 24px;
}
.hero {
  max-width: 620px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.kicker {
  margin-top: 8px;
}
.hero h1 {
  font-size: clamp(34px, 6vw, 52px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.hl {
  color: var(--primary);
}
.lead {
  font-size: 17px;
  line-height: 1.6;
  color: var(--ink-soft);
  max-width: 56ch;
}
.cta {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
  margin: 10px 0 6px;
}
.madeby {
  font-size: 15px;
  color: var(--ink-soft);
  line-height: 1.6;
  margin-top: 8px;
}
.madeby b {
  color: var(--ink);
}
.hl-link {
  color: var(--primary);
  font-weight: 700;
}
.back {
  margin-top: 16px;
  color: var(--ink-soft);
  font-weight: 700;
}
</style>
