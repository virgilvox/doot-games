<script setup lang="ts">
import { themeList } from '@doot-games/themes'
import { DootLogo, ThemeProvider } from '@doot-games/ui'

const theme = useState('doot-theme', () => 'doot')
const route = useRoute()
const chrome = computed(() => !route.path.startsWith('/host/') && !route.path.startsWith('/play/'))

const session = authClient.useSession()
const user = computed(() => session.value?.data?.user ?? null)
const loggedIn = computed(() => !!user.value)
async function logout() {
  await authClient.signOut()
  await navigateTo('/')
}
</script>

<template>
  <ThemeProvider :theme-id="theme">
    <header v-if="chrome" class="topbar">
      <div class="inner">
        <NuxtLink to="/" class="navlink" style="padding:0;background:none;border:none">
          <DootLogo :size="40" />
        </NuxtLink>
        <nav class="nav">
          <NuxtLink to="/" class="navlink">Home</NuxtLink>
          <NuxtLink to="/explore" class="navlink">Explore</NuxtLink>
          <NuxtLink to="/create" class="navlink">Create</NuxtLink>
        </nav>
        <div class="bar-spacer" />
        <div class="account">
          <template v-if="loggedIn">
            <span class="account-email" :title="user?.email">{{ user?.email }}</span>
            <button class="linkbtn" @click="logout">Log out</button>
          </template>
          <NuxtLink v-else to="/login" class="navlink">Log in</NuxtLink>
        </div>
        <div class="themebar">
          <span class="lbl mono">theme</span>
          <button
            v-for="t in themeList"
            :key="t.id"
            class="swatch"
            :class="{ on: theme === t.id }"
            :title="t.name"
            :aria-label="`Theme: ${t.name}`"
            :style="{ background: `linear-gradient(135deg, ${t.tokens.primary}, ${t.tokens.c1})` }"
            @click="theme = t.id"
          />
        </div>
      </div>
    </header>
    <NuxtPage />
  </ThemeProvider>
</template>

<style scoped>
.account {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-right: 14px;
}
.account-email {
  font-size: 13px;
  color: var(--ink-soft);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linkbtn {
  background: none;
  border: none;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  padding: 0;
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
</style>
