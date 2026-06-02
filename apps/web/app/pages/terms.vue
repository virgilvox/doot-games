<script setup lang="ts">
/** Terms of Service for doot.games. Plain language, free best-effort service. */
useHead({ title: 'Terms, Doot' })
const updated = 'June 2, 2026'
</script>

<template>
  <main>
    <div class="wrap legal">
      <span class="kicker">Doot</span>
      <h1>Terms of Service</h1>
      <p class="updated">Last updated {{ updated }}</p>

      <p class="lead">
        Doot is a free service for hosting live party games on a screen while everyone plays from their
        phone. By using doot.games you agree to these terms. They are written plainly. Doot is also open
        source and self-hostable, so a copy someone else runs is governed by whoever runs it, not by these
        terms.
      </p>

      <section>
        <h2>The service</h2>
        <p>
          Doot is offered for free and on a best-effort basis. It may change, have downtime, or be
          discontinued at any time. We do not promise it will always be available or bug-free. Hosting and
          playing a game need no account; an account is optional and only lets you save games to reuse and
          share.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of the games you create. When you set a game to public or unlisted, you allow
          other people to view and host it, and to copy (fork) it if you enable that. You are responsible for
          what you put into a game: prompts, answers, images, and any text. Only upload or publish content you
          have the right to use, and keep it lawful.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>Do not use Doot to:</p>
        <ul>
          <li>Upload or share content that is illegal, infringing, or that you do not have the right to share.</li>
          <li>Harass, threaten, or target other people.</li>
          <li>Break, overload, probe, or abuse the service, the relay, the API, or the Claude connection.</li>
          <li>Impersonate someone else or misrepresent who made a game.</li>
        </ul>
        <p>
          We may remove content, rooms, or accounts that break these rules, and we may limit or end access to
          keep the service working for everyone.
        </p>
      </section>

      <section>
        <h2>Connect with Claude</h2>
        <p>
          If you connect your own Claude to Doot, your Claude writes a game and saves it to your account
          through a standard authorized connection. You are responsible for what you choose to save. Doot runs
          no AI of its own and stores no AI provider keys. See the
          <NuxtLink to="/privacy">privacy policy</NuxtLink> for what is stored.
        </p>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          Doot is provided "as is" and "as available," without warranties of any kind. To the extent the law
          allows, we are not liable for any loss or damage arising from using, or being unable to use, the
          service.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We may update these terms. If they change in a meaningful way we will update the date above.
          Continued use after a change means you accept the updated terms.
        </p>
      </section>

      <p class="contact">
        Questions: open an issue on our
        <a href="https://github.com/virgilvox/doot-games/issues" target="_blank" rel="noopener">GitHub</a>.
      </p>
    </div>
  </main>
</template>

<style scoped>
.legal {
  max-width: 760px;
  padding: 44px 0 60px;
}
.legal h1 {
  font-size: clamp(34px, 6vw, 50px);
  font-weight: 800;
  margin-top: 8px;
}
.updated {
  color: var(--mute);
  font-size: 14px;
  margin-top: 6px;
}
.lead {
  font-size: 17px;
  line-height: 1.6;
  color: var(--ink-soft);
  margin-top: 20px;
}
.legal section {
  margin-top: 28px;
}
.legal h2 {
  font-size: 22px;
  font-weight: 800;
  margin-bottom: 10px;
}
.legal p {
  line-height: 1.6;
  color: var(--ink-soft);
}
.legal ul {
  margin: 8px 0 0;
  padding-left: 20px;
  line-height: 1.6;
  color: var(--ink-soft);
}
.legal li {
  margin-bottom: 6px;
}
.legal a {
  color: var(--primary);
  font-weight: 600;
  text-decoration: none;
}
.legal a:hover {
  text-decoration: underline;
}
.contact {
  margin-top: 32px;
  padding-top: 20px;
  border-top: var(--bd) solid var(--line-soft);
}
</style>
