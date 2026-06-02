<script setup lang="ts">
// "Connect with Claude": a user points their own Claude at Doot's MCP server and
// Claude builds a game for them. Doot runs no inference and stores no keys, so it
// stays free. The server lives at server/routes/mcp.ts.
const endpoint = 'https://doot.games/mcp'
const claudeCodeCmd = `claude mcp add --transport http doot ${endpoint}`

useHead({ title: 'Connect with Claude' })
</script>

<template>
  <main>
    <div class="wrap connect">
      <div class="c-head">
        <span class="kicker">Build with Claude</span>
        <h1>Connect with Claude</h1>
        <p class="lead">
          Point your own Claude at Doot and it builds games for you. You use your Claude, so it stays free, and Doot
          never sees your account or your chats. Doot runs no AI of its own.
        </p>
      </div>

      <ol class="steps">
        <li>
          <span class="step-n">1</span>
          <div class="step-b">
            <h3>Add Doot to Claude</h3>
            <p>In <b>Claude Code</b>, run this once:</p>
            <pre class="cmd">{{ claudeCodeCmd }}</pre>
            <p>In the <b>Claude desktop app</b>, open Settings, add a custom connector, and paste this URL:</p>
            <pre class="cmd">{{ endpoint }}</pre>
          </div>
        </li>
        <li>
          <span class="step-n">2</span>
          <div class="step-b">
            <h3>Ask for a game</h3>
            <p>
              Tell Claude what you want, for example: <i>"Make me a Doot trivia game about 90s movies, five rounds,
              mix the types."</i> Claude reads Doot's format, writes the game, and checks it.
            </p>
          </div>
        </li>
        <li>
          <span class="step-n">3</span>
          <div class="step-b">
            <h3>Drop it into Doot</h3>
            <p>
              Claude hands you the game as a short markdown spec. Open <NuxtLink to="/create">Create</NuxtLink>, pick
              the <b>Custom</b> game type, click <b>Import from Markdown</b>, paste, and host it.
            </p>
          </div>
        </li>
      </ol>

      <div class="note">
        Your Claude does the work, against Doot's real game format, so what it builds imports cleanly. The tools it
        uses are read-only: list the game types, read the format guide, and check a draft.
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
.cmd {
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 10px;
  padding: 10px 12px;
  font: 13px/1.4 ui-monospace, monospace;
  overflow-x: auto;
  white-space: pre;
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
