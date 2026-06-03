<script setup lang="ts">
import { flagshipGames, gameCatalog } from '@doot-games/games/catalog'
import { GameCover, GameTypeIcon } from '@doot-games/ui'
import { computed, ref } from 'vue'

const code = ref('')
function join() {
  const c = code.value.trim().toUpperCase()
  if (c.length === 4) navigateTo(`/play/${c}`)
}

interface SavedGameSummary {
  id: string
  pluginId: string
  title: string
  themeId: string
  authorName: string | null
  authorHandle: string | null
  coverImage: string | null
  createdAt: number
}
const { data: pub } = await useFetch<{ games: SavedGameSummary[] }>('/api/games', {
  default: () => ({ games: [] }),
})
const publicGames = computed(() => pub.value?.games ?? [])
// Rails only appear once there's a real shelf to browse (no thin/empty rows).
const MIN_RAIL = 5
const enoughCommunity = computed(() => publicGames.value.length >= MIN_RAIL)
const trending = computed(() => publicGames.value.slice(0, 8))
const fresh = computed(() => [...publicGames.value].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8))
const typeName = (id: string) => gameCatalog.find((c) => c.id === id)?.name ?? id

// "Create with blocks": Custom leads (mix any blocks or use a two-phase recipe),
// then the core single-block primitives. The flagship "Games From Doot" are
// remixable too but live in their own rail + on /create, so this row stays the
// blank-canvas starting points for a clean, uniform grid.
const blockTypes = gameCatalog.filter((c) => !c.flagship)
const vibes = [...blockTypes].sort((a, b) => (a.id === 'custom' ? -1 : b.id === 'custom' ? 1 : 0))
// Games From Doot, listed alphabetically by name for a predictable, scannable rail.
const flagshipsSorted = [...flagshipGames].sort((a, b) => a.name.localeCompare(b.name))
</script>

<template>
  <main>
    <div class="wrap">
      <section class="hero">
        <div class="hero-text">
          <span class="tag"><i /> Host on a screen, play on your phone</span>
          <h1>Put a game on the <span class="hl">big screen.</span> Everyone joins from their phone.</h1>
          <p class="lead">
            Doot runs party games for any room. Host trivia at the bar, guess characters at a con
            panel, run a live poll in class, or start something silly on the TV. No app to install,
            no account to play.
          </p>
          <div class="hero-cta">
            <div class="joinbig">
              <input v-model="code" placeholder="ENTER CODE" maxlength="4" aria-label="Room code" @keyup.enter="join" @input="code = code.toUpperCase()" />
              <button @click="join">Join</button>
            </div>
            <NuxtLink to="/explore" class="btn btn-primary btn-lg">Browse games</NuxtLink>
          </div>
          <div class="hero-foot">
            <div class="facepile">
              <span style="background: #ff5a33">K</span><span style="background: #16c8b5">D</span>
              <span style="background: #5b79ff">S</span><span style="background: #ff73b3">M</span>
            </div>
            <span>Hosted by panelists, bartenders, teachers, and friends</span>
          </div>
        </div>
        <div class="hero-vis" aria-hidden="true">
          <div class="float-badge fb-1">
            <svg class="ic" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 6" /></svg> Correct! +1
          </div>
          <div class="screen">
            <div class="scr-top"><i /><i /><i /></div>
            <div class="scr-body">
              <div class="scr-q">Who is this character?</div>
              <div class="scr-img" />
              <div class="scr-opts">
                <div class="scr-opt"><span class="fill" style="width: 64%" /><b>A</b><span>Sailor</span></div>
                <div class="scr-opt"><b>B</b><span>Knight</span></div>
                <div class="scr-opt"><b>C</b><span>Witch</span></div>
                <div class="scr-opt"><b>D</b><span>Pilot</span></div>
              </div>
            </div>
          </div>
          <div class="phone">
            <div class="pscr">
              <div class="ttl">Tap your answer</div>
              <div class="opt sel">A. Sailor</div>
              <div class="opt">B. Knight</div>
              <div class="opt">C. Witch</div>
            </div>
          </div>
          <div class="float-badge fb-2">
            <svg class="ic" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" /></svg> 28 voted
          </div>
        </div>
      </section>

      <!-- Games From Doot: ready to play -->
      <section class="section">
        <div class="section-head">
          <div><span class="kicker">Ready to play</span><h2>Games From Doot</h2></div>
          <NuxtLink class="more" to="/explore">See all &rarr;</NuxtLink>
        </div>
        <div class="rail">
          <NuxtLink v-for="g in flagshipsSorted" :key="g.id" :to="`/host/${g.id}`" class="card rail-card">
            <GameCover :title="g.name" :type="g.id" />
            <div class="card-body">
              <div class="card-title">{{ g.name }}</div>
              <p class="rail-desc">{{ g.description }}</p>
              <span class="card-cta">Host now &rarr;</span>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- How Doot works: the three-step flow -->
      <section class="section how">
        <div class="section-head"><div><span class="kicker">Three steps</span><h2>How Doot works</h2></div></div>
        <div class="how-steps">
          <div class="how-step" style="--accent: var(--c4)">
            <div class="how-top">
              <div class="how-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 16 8" /><path d="m13.5 6 4.5 4.5" /><path d="M18.4 3.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" fill="currentColor" stroke="none" /></svg>
              </div>
              <span class="how-num">1</span>
            </div>
            <h4>Pick or make a game</h4>
            <p>Grab a Game From Doot or build your own. Choose a theme that styles the lobby and the whole game.</p>
          </div>
          <div class="how-step" style="--accent: var(--c2)">
            <div class="how-top">
              <div class="how-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
              </div>
              <span class="how-num">2</span>
            </div>
            <h4>Put it on the big screen</h4>
            <p>Open it on a TV, a projector, or a shared laptop. A join code and QR appear for the room.</p>
          </div>
          <div class="how-step" style="--accent: var(--primary)">
            <div class="how-top">
              <div class="how-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>
              </div>
              <span class="how-num">3</span>
            </div>
            <h4>Everyone plays along</h4>
            <p>The crowd joins from their phones, answers each round, and the results pop on screen.</p>
          </div>
        </div>
      </section>

      <!-- Trending (only once there's a real shelf) -->
      <section v-if="enoughCommunity" class="section">
        <div class="section-head">
          <div><span class="kicker">Hot right now</span><h2>Trending games</h2></div>
          <NuxtLink class="more" to="/explore">See all &rarr;</NuxtLink>
        </div>
        <div class="rail">
          <div v-for="g in trending" :key="g.id" class="card rail-card card-link">
            <NuxtLink :to="`/g/${g.id}`" class="card-stretch" :aria-label="`${g.title}, view and host`" />
            <GameCover :title="g.title" :type="g.pluginId" :image="g.coverImage" />
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta"><span class="badge type">{{ typeName(g.pluginId) }}</span></div>
              <NuxtLink v-if="g.authorHandle" :to="`/u/@${g.authorHandle}`" class="card-by card-by-link">by @{{ g.authorHandle }}</NuxtLink>
              <p v-else-if="g.authorName" class="card-by">by {{ g.authorName }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Create with blocks: pick a core building block to build from -->
      <section class="section">
        <div class="section-head">
          <div><span class="kicker">Start from a block</span><h2>Create with blocks</h2></div>
          <NuxtLink class="more" to="/create">See all &rarr;</NuxtLink>
        </div>
        <div class="vibes">
          <NuxtLink v-for="v in vibes" :key="v.id" :to="`/editor/${v.id}`" class="vibe">
            <GameTypeIcon :type="v.id" :size="44" />
            <h4>{{ v.name }}</h4>
            <p>{{ v.description }}</p>
          </NuxtLink>
        </div>
      </section>

      <!-- Fresh from creators (only once there's a real shelf) -->
      <section v-if="enoughCommunity" class="section">
        <div class="section-head">
          <div><span class="kicker">New this week</span><h2>Fresh from creators</h2></div>
          <NuxtLink class="more" to="/explore">See all &rarr;</NuxtLink>
        </div>
        <div class="rail">
          <div v-for="g in fresh" :key="g.id" class="card rail-card card-link">
            <NuxtLink :to="`/g/${g.id}`" class="card-stretch" :aria-label="`${g.title}, view and host`" />
            <GameCover :title="g.title" :type="g.pluginId" :image="g.coverImage" />
            <div class="card-body">
              <div class="card-title">{{ g.title }}</div>
              <div class="card-meta"><span class="badge type">{{ typeName(g.pluginId) }}</span></div>
              <NuxtLink v-if="g.authorHandle" :to="`/u/@${g.authorHandle}`" class="card-by card-by-link">by @{{ g.authorHandle }}</NuxtLink>
              <p v-else-if="g.authorName" class="card-by">by {{ g.authorName }}</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  </main>
</template>

<style scoped>
.hero-text {
  min-width: 0;
}
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
  width: 140px;
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
  cursor: pointer;
}
.hero-foot {
  margin-top: 22px;
  display: flex;
  align-items: center;
  gap: 16px;
  color: var(--ink-soft);
  font-size: 14px;
  font-weight: 600;
}
.facepile {
  display: flex;
}
.facepile span {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2.5px solid var(--bg);
  margin-left: -9px;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 12px;
  color: #fff;
}
.facepile span:first-child {
  margin-left: 0;
}
.hero-vis {
  position: relative;
  min-height: 380px;
}
.screen {
  position: absolute;
  inset: 6% 12% 18% 0;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  overflow: hidden;
  transform: rotate(-2deg);
}
.scr-top {
  height: 34px;
  background: var(--surface-2);
  border-bottom: var(--bd) solid var(--line-soft);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
}
.scr-top i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--line-soft);
}
.scr-body {
  padding: 18px 18px 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.scr-q {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 21px;
  line-height: 1.05;
}
.scr-img {
  height: 84px;
  border-radius: 12px;
  border: var(--bd) solid var(--line-soft);
  background: linear-gradient(135deg, var(--c4), var(--c3));
  position: relative;
  overflow: hidden;
}
.scr-img::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(255, 255, 255, 0.5) 1.5px, transparent 1.6px);
  background-size: 13px 13px;
  opacity: 0.5;
}
.scr-opts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.scr-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  padding: 8px 10px;
  font-weight: 700;
  font-size: 13px;
  position: relative;
  overflow: hidden;
}
.scr-opt b {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-size: 13px;
  flex: none;
}
.scr-opt .fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: color-mix(in srgb, var(--primary) 20%, transparent);
}
.scr-opt span {
  position: relative;
}
.phone {
  position: absolute;
  right: -2%;
  bottom: 0;
  width: 118px;
  height: 228px;
  background: var(--ink);
  border-radius: 26px;
  padding: 8px;
  box-shadow: var(--shadow);
  transform: rotate(6deg);
}
.phone .pscr {
  width: 100%;
  height: 100%;
  background: var(--primary);
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 11px;
  padding: 14px;
  text-align: center;
}
.phone .pscr .ttl {
  font-family: var(--font-display);
  font-weight: 800;
  color: var(--primary-ink);
  font-size: 15px;
  line-height: 1.05;
}
.phone .pscr .opt {
  width: 100%;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 11px;
  padding: 9px;
  font-weight: 800;
  font-size: 12px;
  color: #241910;
}
.phone .pscr .opt.sel {
  background: var(--ink);
  color: #fff;
}
.float-badge {
  position: absolute;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 14px;
  padding: 8px 12px;
  box-shadow: var(--shadow);
  font-weight: 800;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 7px;
  z-index: 2;
}
.float-badge .ic {
  width: 17px;
  height: 17px;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.fb-1 {
  top: 2%;
  left: 8%;
  transform: rotate(-6deg);
  color: var(--c2);
}
.fb-2 {
  bottom: 6%;
  left: 2%;
  transform: rotate(5deg);
  color: var(--c3);
}
.more {
  color: var(--primary);
  font-weight: 700;
  font-size: 14px;
}
.rail {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  padding: 6px 2px 14px;
  scroll-snap-type: x mandatory;
}
.rail-card {
  min-width: 248px;
  scroll-snap-align: start;
}
.card-by {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-soft);
}
.rail-desc {
  font-size: 14px;
  color: var(--ink-soft);
  line-height: 1.5;
  margin: 0 0 12px;
  min-height: 42px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-cta {
  display: inline-block;
  color: var(--primary);
  font-weight: 800;
  font-size: 14px;
}
.vibes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}
.vibe {
  border: var(--bd) solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.12s, box-shadow 0.12s;
  display: block;
  text-decoration: none;
  color: inherit;
}
.vibe:hover {
  transform: translate(-2px, -2px);
  box-shadow: var(--shadow);
}
.vibe h4 {
  font-size: 20px;
  font-weight: 800;
  margin: 12px 0 3px;
}
.vibe p {
  font-size: 13px;
  color: var(--ink-soft);
  line-height: 1.45;
}
/* How Doot works: playful three-step flow */
.how-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 22px;
}
/* dashed connector threading the gaps between cards */
.how-steps::before {
  content: '';
  position: absolute;
  top: 54px;
  left: 9%;
  right: 9%;
  border-top: 3px dashed var(--line-soft);
  z-index: 0;
}
.how-step {
  --accent: var(--primary);
  position: relative;
  z-index: 1;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 24px 24px 26px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
/* soft accent wash bleeding from the top-right corner */
.how-step::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 150px;
  height: 150px;
  background: radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 24%, transparent), transparent 70%);
  pointer-events: none;
}
.how-step:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow), var(--glow) color-mix(in srgb, var(--accent) 42%, transparent);
}
.how-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.how-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: grid;
  place-items: center;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--accent) 45%, var(--line-soft));
  box-shadow: var(--shadow-sm);
  transform: rotate(-6deg);
  transition: transform 0.15s ease;
}
.how-step:hover .how-icon {
  transform: rotate(0deg) scale(1.06);
}
.how-icon svg {
  width: 28px;
  height: 28px;
  stroke: currentColor;
  fill: none;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.how-num {
  position: relative;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 58px;
  line-height: 1;
  color: var(--accent);
  opacity: 0.24;
}
.how-step h4 {
  position: relative;
  font-size: 21px;
  font-weight: 800;
  margin: 0 0 8px;
}
.how-step p {
  position: relative;
  font-size: 15px;
  color: var(--ink-soft);
  line-height: 1.55;
  margin: 0;
}
@media (max-width: 980px) {
  .how-steps {
    grid-template-columns: 1fr;
  }
  .how-steps::before {
    display: none;
  }
}
@media (max-width: 860px) {
  .hero-vis {
    min-height: 320px;
  }
}
/* Phones: let the join box fill the row so "ENTER CODE" isn't clipped, and let
   the primary CTA go full-width beneath it. */
@media (max-width: 560px) {
  .hero-cta {
    width: 100%;
  }
  .joinbig {
    width: 100%;
  }
  .joinbig input {
    width: auto;
    flex: 1;
    min-width: 0;
  }
  .hero-cta .btn-lg {
    width: 100%;
  }
}
</style>
