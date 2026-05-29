<script setup lang="ts">
import { builtinPlugins } from '@doot-games/games'
import { ref } from 'vue'

const code = ref('')
function join() {
  const c = code.value.trim().toUpperCase()
  if (c.length === 4) navigateTo(`/play/${c}`)
}

// The discrete game types players can host, drawn from the plugin registry.
const types = builtinPlugins.map((p) => ({
  id: p.manifest.id,
  name: p.manifest.name,
  description: p.manifest.description,
}))
</script>

<template>
  <main>
    <div class="wrap">
      <section class="hero">
        <div>
          <span class="tag"><i /> No app to install · no account to play</span>
          <h1>Put a game on the <span class="hl">big screen.</span> Everyone joins from their phone.</h1>
          <p class="lead">
            Doot runs party games for any room. Host trivia at the bar, guess characters at a con
            panel, run a live poll in class, or start something silly on the TV.
          </p>
          <div class="hero-cta">
            <div class="joinbig">
              <input
                v-model="code"
                placeholder="ENTER CODE"
                maxlength="4"
                aria-label="Room code"
                @keyup.enter="join"
                @input="code = code.toUpperCase()"
              />
              <button @click="join">Join</button>
            </div>
            <NuxtLink to="/explore" class="btn btn-primary btn-lg">Browse games</NuxtLink>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="screen-mock">
            <div class="q">Who is this character?</div>
            <div class="opts">
              <span class="o"><b>A</b> Sailor</span>
              <span class="o on"><b>B</b> Knight</span>
              <span class="o"><b>C</b> Witch</span>
              <span class="o"><b>D</b> Pilot</span>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <div><span class="kicker">Pick a type</span><h2>Host a game</h2></div>
        </div>
        <div class="grid">
          <NuxtLink v-for="t in types" :key="t.id" :to="`/host/${t.id}`" class="card type-card">
            <div class="card-body">
              <div class="card-title">{{ t.name }}</div>
              <p class="type-desc">{{ t.description }}</p>
              <span class="btn btn-primary btn-sm">Host this</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="section">
        <div class="section-head"><div><span class="kicker">Three steps</span><h2>How Doot works</h2></div></div>
        <div class="steps">
          <div class="step">
            <div class="n">1</div>
            <h4>Pick or make a game</h4>
            <p>Grab one here or build your own. Choose a theme that styles the lobby and the whole game.</p>
          </div>
          <div class="step">
            <div class="n">2</div>
            <h4>Put it on the big screen</h4>
            <p>Open it on a TV, a projector, or a shared laptop. A join code and QR appear for the room.</p>
          </div>
          <div class="step">
            <div class="n">3</div>
            <h4>Everyone plays along</h4>
            <p>The crowd joins from their phones, answers each round, and the results pop on screen.</p>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.joinbig {
  display: flex;
  align-items: center;
  border: var(--bd) solid var(--line);
  border-radius: 999px;
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.joinbig input {
  border: none;
  outline: none;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 18px;
  padding: 14px 8px 14px 22px;
  width: 150px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink);
}
.joinbig button {
  border: none;
  background: var(--ink);
  color: var(--bg);
  font-weight: 800;
  padding: 0 24px;
  align-self: stretch;
}
.hero-art {
  display: grid;
  place-items: center;
}
.screen-mock {
  width: 100%;
  max-width: 360px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 20px;
  transform: rotate(-2deg);
}
.screen-mock .q {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 22px;
  margin-bottom: 14px;
}
.screen-mock .opts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.screen-mock .o {
  display: flex;
  align-items: center;
  gap: 8px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  padding: 9px 11px;
  font-weight: 700;
  font-size: 14px;
}
.screen-mock .o b {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
}
.screen-mock .o.on {
  background: var(--primary);
  color: var(--primary-ink);
  border-color: var(--line);
}
.type-card {
  cursor: pointer;
}
.type-desc {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0 0 14px;
  min-height: 60px;
}
</style>
