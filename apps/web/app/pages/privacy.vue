<script setup lang="ts">
/** Privacy policy for doot.games. Plain language, no tracking, no data sales. */
useHead({ title: 'Privacy, Doot' })
const updated = 'June 2, 2026'
</script>

<template>
  <main>
    <div class="wrap legal">
      <span class="kicker">Doot</span>
      <h1>Privacy</h1>
      <p class="updated">Last updated {{ updated }}</p>

      <p class="lead">
        Doot is a place to host live party games on a screen while everyone plays from their phone.
        This policy covers doot.games. It is written plainly: what we store, why, and what we never do.
        Doot is open source and self-hostable, so a copy you host yourself is governed by whoever runs it.
      </p>

      <section>
        <h2>The short version</h2>
        <ul>
          <li>Hosting and playing a game need no account and no personal details.</li>
          <li>Nothing about a game in progress is written to our database. Live game state lives on the
            relay and expires on its own (8 hours by default).</li>
          <li>An account is optional and only used to save games you can share and host again.</li>
          <li>We do not sell your data, run ads, or load third-party tracking.</li>
        </ul>
      </section>

      <section>
        <h2>Playing and hosting (no account)</h2>
        <p>
          When you join a room, your player identity is derived from the room code and the name you type.
          It is not tied to an account and is not stored in our database. Your answers, votes, and the live
          tallies travel over the CLASP relay (<a href="https://clasp.to" target="_blank" rel="noopener">clasp.to</a>),
          which holds them only briefly: every value carries an expiry (8 hours by default) and then clears
          itself. Re-entering the same name in the same room reclaims your inputs from that temporary state.
        </p>
      </section>

      <section>
        <h2>Accounts (optional)</h2>
        <p>
          You only need an account to save a game. If you create one we store your email address, a securely
          hashed password (we never see or keep the plain password), and anything you choose to add such as a
          username or short bio. Your sign-in is kept in a single secure, http-only cookie. There are no
          advertising or tracking cookies.
        </p>
      </section>

      <section>
        <h2>Saved games and uploads</h2>
        <p>
          A saved game stores what you authored: its title, rounds, theme, optional description and tags, and
          an optional cover image. You control its visibility. A game set to public is listed on Explore and
          credited to your chosen @handle (never your email). Images you upload are stored on DigitalOcean
          Spaces and served from there. You can change a game's visibility or delete it at any time from
          Your Games, which removes it from our database.
        </p>
      </section>

      <section>
        <h2>Connect with Claude</h2>
        <p>
          Doot can connect to Claude through the Model Context Protocol so your own Claude can write a game and
          save it straight to your Doot account. You authorize this with a standard OAuth flow and an explicit
          consent screen, and you can disconnect it at any time. Doot runs no AI itself and stores no AI
          provider keys: the work happens in your Claude, and only the finished game (and any image you ask it
          to attach) is saved to your account, exactly as if you had built it in the editor.
        </p>
      </section>

      <section>
        <h2>What we never do</h2>
        <ul>
          <li>We do not sell or rent your personal data.</li>
          <li>We do not show ads or embed third-party advertising or analytics trackers.</li>
          <li>We do not write your in-room gameplay to a long-term database.</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          Delete any saved game yourself from Your Games. To delete your whole account and the games tied to
          it, or to ask what we hold about you, email
          <a href="mailto:hackbuildvideo@gmail.com">hackbuildvideo@gmail.com</a> and we will take care of it.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          If this policy changes in a meaningful way we will update the date above. Continued use after a
          change means you accept the updated policy.
        </p>
      </section>

      <p class="contact">
        Questions: <a href="mailto:hackbuildvideo@gmail.com">hackbuildvideo@gmail.com</a>.
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
