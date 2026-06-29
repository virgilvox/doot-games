<script setup lang="ts">
import { themeList } from '@doot-games/themes'
import { DootLogo, SiteFooter, ThemeProvider } from '@doot-games/ui'

const theme = useState('doot-theme', () => 'doot')
const route = useRoute()
const chrome = computed(
  () => !route.path.startsWith('/host/') && !route.path.startsWith('/play/') && !route.path.startsWith('/watch/'),
)

// The account control (avatar + dropdown, or Log in / Sign up) lives in
// <AccountMenu>; the shell only needs `loggedIn` to gate the Your Games / Saved nav.
const session = authClient.useSession()
const user = computed(() => session.value?.data?.user ?? null)
const loggedIn = computed(() => !!user.value)

// Site-wide OG/Twitter defaults (branded /og.png card, site name, summary_large_image).
// Pages override with their own title/description/image (a game uses its cover).
useDootSeo()
</script>

<template>
  <ThemeProvider :theme-id="theme">
    <header v-if="chrome" class="topbar">
      <div class="inner">
        <NuxtLink to="/" class="navlink" style="padding:0;background:none;border:none">
          <DootLogo :size="40" />
        </NuxtLink>
        <nav class="nav">
          <NuxtLink to="/" class="navlink nav-home">Home</NuxtLink>
          <NuxtLink to="/explore" class="navlink">Explore</NuxtLink>
          <NuxtLink to="/create" class="navlink">Create</NuxtLink>
          <NuxtLink to="/decks" class="navlink">Decks</NuxtLink>
          <NuxtLink v-if="loggedIn" to="/mine" class="navlink">Your Games</NuxtLink>
          <NuxtLink v-if="loggedIn" to="/saved" class="navlink">Saved</NuxtLink>
          <!-- On phones the Support pill is dropped from the top row (it wraps to its
               own line); surface it here in the nav row instead so it stays reachable. -->
          <NuxtLink to="/support" class="navlink nav-support">Support</NuxtLink>
        </nav>
        <div class="bar-spacer" />
        <AccountMenu class="account" />
        <div class="themebar" role="group" aria-label="Theme">
          <span class="lbl mono">theme</span>
          <button
            v-for="t in themeList"
            :key="t.id"
            class="swatch"
            :class="{ on: theme === t.id }"
            :title="t.name"
            :aria-label="`Theme: ${t.name}`"
            :aria-pressed="theme === t.id"
            :style="{ background: `linear-gradient(135deg, ${t.tokens.primary}, ${t.tokens.c1})` }"
            @click="theme = t.id"
          />
        </div>
        <NuxtLink to="/support" class="support-btn" title="Support Doot">
          Support
        </NuxtLink>
      </div>
    </header>
    <NuxtPage />
    <SiteFooter v-if="chrome" />
  </ThemeProvider>
</template>

<style scoped>
/* The account control is <AccountMenu>; this just spaces it from the theme bar.
   A parent's scoped style reaches a child component's root element, so this lands
   on the AccountMenu root (which carries class="account"). */
.account {
  margin-right: 14px;
}
.themebar {
  display: flex;
  align-items: center;
  gap: 7px;
}
.themebar .lbl {
  font-size: 11px;
  color: var(--mute);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  border: 2px solid var(--line);
  cursor: pointer;
  transition: transform 0.1s;
  padding: 0;
}
.swatch:hover {
  transform: scale(1.15);
}
.swatch.on {
  outline: 3px solid var(--ink);
  outline-offset: 1px;
}
/* The in-nav Support link is phone-only; the desktop header uses the pill below. */
.nav-support {
  display: none;
}
.support-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 14px;
  padding: 8px 15px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--primary);
  color: var(--primary-ink);
  font-weight: 800;
  font-size: 14px;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
  transition: transform 0.1s;
}
.support-btn:hover {
  transform: translateY(-1px);
}
.support-btn .heart {
  font-size: 13px;
}

/* Mobile topbar: keep the nav reachable, drop the theme switcher + email, and
   tighten padding so nothing overflows. (The global stylesheet hides .nav at
   980px; this scoped rule wins and keeps it as a compact bar instead.) */
@media (max-width: 980px) {
  .nav {
    display: flex;
    gap: 2px;
  }
  .navlink {
    padding: 8px 11px;
    font-size: 14px;
  }
}
@media (max-width: 720px) {
  .themebar {
    display: none;
  }
  .topbar .inner {
    padding-left: 14px;
    padding-right: 14px;
    gap: 8px;
  }
  .nav-home {
    display: none;
  }
  .navlink {
    padding: 7px 9px;
    font-size: 13px;
  }
  .support-btn {
    margin-left: 6px;
    padding: 7px 11px;
  }
}
/* Phones: the logo + account + Support don't fit on one row with the nav, so
   wrap the nav onto its own full-width row (scrollable if needed). Drop the flex
   spacer so the top row packs logo (left) against the actions (right). */
@media (max-width: 620px) {
  .topbar .inner {
    flex-wrap: wrap;
    row-gap: 8px;
    justify-content: space-between;
  }
  .bar-spacer {
    display: none;
  }
  .nav {
    order: 10;
    flex-basis: 100%;
    justify-content: center;
    overflow-x: auto;
    gap: 4px;
  }
  .account {
    margin-right: 0;
  }
  /* Drop the standalone Support pill (it wraps to its own row at this width) and
     show Support as a nav link in the full-width nav row instead. */
  .support-btn {
    display: none;
  }
  .nav-support {
    display: inline-flex;
  }
}
</style>
