<script setup lang="ts">
import { ref } from 'vue'
// "Connect with Claude": a user points their own Claude at Doot's MCP server and
// Claude builds a game for them. Doot runs no inference and stores no keys, so it
// stays free. The server lives at server/routes/mcp.ts.
const endpoint = 'https://doot.games/mcp'
const claudeCodeCmd = `claude mcp add --transport http doot ${endpoint}`
// Step 1 has two ALTERNATIVE setups (the Claude app vs Claude Code). Showing both
// stacked made people think they had to do both, so this is an explicit either/or:
// pick how you use Claude and see only that one path.
const kind = ref<'app' | 'code'>('app')

useHead({ title: 'Connect with Claude' })
</script>

<template>
  <main>
    <div class="wrap connect">
      <div class="c-head">
        <span class="kicker">Build with Claude</span>
        <h1>Connect with Claude</h1>
        <p class="lead">
          Link your Doot account inside Claude and it builds games for you, then saves them straight to your account.
          You use your own Claude, so it stays free, and Doot runs no AI of its own.
        </p>
      </div>

      <ol class="steps">
        <li>
          <span class="step-n">1</span>
          <div class="step-b">
            <h3>Add Doot as a connector</h3>
            <p>Pick how you use Claude. You only need one.</p>
            <div class="seg" role="group" aria-label="Which Claude are you using?">
              <button type="button" :aria-pressed="kind === 'app'" :class="{ on: kind === 'app' }" @click="kind = 'app'">Claude app (claude.ai)</button>
              <button type="button" :aria-pressed="kind === 'code'" :class="{ on: kind === 'code' }" @click="kind = 'code'">Claude Code (CLI)</button>
            </div>
            <template v-if="kind === 'app'">
              <p>In <b>claude.ai</b> or the desktop app, open Settings, then Connectors, then Add custom connector, and paste this URL:</p>
              <pre class="cmd">{{ endpoint }}</pre>
            </template>
            <template v-else>
              <p>In a terminal, run this once:</p>
              <pre class="cmd">{{ claudeCodeCmd }}</pre>
            </template>
            <p>Claude opens Doot in your browser. Sign in and click <b>Allow</b>. That links your account, once.</p>
          </div>
        </li>
        <li>
          <span class="step-n">2</span>
          <div class="step-b">
            <h3>Ask Claude to build a game</h3>
            <p>
              Say what you want, for example: <i>"Make a Doot trivia game about 90s movies, five rounds, mix the
              types, and save it to my account."</i> Claude reads Doot's format, writes the game, and checks it.
            </p>
          </div>
        </li>
        <li>
          <span class="step-n">3</span>
          <div class="step-b">
            <h3>It saves to your account</h3>
            <p>
              Claude saves the game to your account and gives you a link. Open it (or find it under
              <NuxtLink to="/mine">your games</NuxtLink>) to pick a theme, tweak anything, and host it.
            </p>
          </div>
        </li>
      </ol>

      <div class="note">
        Your Claude does the work against Doot's real game format, so what it builds is ready to host. You can remove
        Doot's access any time from your account settings or from Claude.
      </div>
    </div>
  </main>
</template>

<style scoped>
.connect {
  max-width: 760px;
}
.c-head {
  text-align: center;
  padding: 40px 0 8px;
}
.c-head h1 {
  font-size: clamp(32px, 6vw, 46px);
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-top: 8px;
}
.lead {
  font-size: 18px;
  color: var(--ink-soft);
  margin-top: 12px;
  margin-inline: auto;
  max-width: 60ch;
}
.steps {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.steps li {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 20px 22px;
  box-shadow: var(--shadow-sm);
}
.step-n {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-family: var(--font-display, inherit);
  color: var(--primary-ink);
  background: var(--primary);
}
.step-b {
  min-width: 0;
}
.step-b h3 {
  font-size: 19px;
  font-weight: 800;
  margin-bottom: 6px;
}
.step-b p {
  color: var(--ink-soft);
  line-height: 1.55;
  margin: 8px 0;
}
.seg {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin: 4px 0 10px;
  border-radius: 999px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
}
.seg button {
  border: none;
  background: transparent;
  border-radius: 999px;
  padding: 7px 14px;
  font: 700 13px/1 inherit;
  color: var(--ink-soft);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.seg button.on {
  background: var(--primary);
  color: var(--primary-ink);
}
.cmd {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 10px;
  padding: 10px 12px;
  font: 13px/1.4 ui-monospace, monospace;
  /* Wrap long commands instead of clipping them off the right edge. */
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ink);
}
.note {
  margin: 22px 0 48px;
  padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--primary) 6%, var(--surface));
  border: var(--bd) solid color-mix(in srgb, var(--primary) 30%, var(--line));
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.55;
}
</style>
