<script setup lang="ts">
/**
 * The account control in the top bar. Signed out: Log in / Sign up. Signed in: a
 * single avatar button that opens a dropdown with the account name/@handle, View
 * profile, Edit profile, Admin (admins only), and Log out.
 *
 * Accessible menu: the button carries aria-haspopup/aria-expanded; the panel is a
 * role="menu" of role="menuitem" links/buttons; Escape and click-outside close it and
 * return focus to the button; Arrow/Home/End move focus between items.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const session = authClient.useSession()
const user = computed(() => session.value?.data?.user ?? null)
const loggedIn = computed(() => !!user.value)
const handle = computed(() => (user.value as { username?: string | null } | null)?.username ?? null)
const image = computed(() => user.value?.image ?? null)

// Admin status only decides whether the Admin item shows; every admin route re-checks
// server-side (requireAdmin), so this is cosmetic. Owned here since this is the only
// place the Admin entry appears now.
const isAdmin = useState('doot-is-admin', () => false)
async function refreshAdmin() {
  if (!import.meta.client) return
  if (!user.value) {
    isAdmin.value = false
    return
  }
  try {
    const r = await $fetch<{ admin: boolean }>('/api/admin/me')
    isAdmin.value = !!r.admin
  } catch {
    isAdmin.value = false
  }
}
watch(() => user.value?.id, refreshAdmin, { immediate: true })

const displayName = computed(() => {
  const u = user.value
  if (!u) return 'Account'
  return u.name?.trim() || (u.email ?? '').split('@')[0] || 'Account'
})
const monogram = computed(() => (displayName.value || '?').charAt(0).toUpperCase())
// Nudge to personalize while the signup default is still in place (no handle and the
// display name still equals the email local-part).
const needsSetup = computed(() => {
  const u = user.value
  if (!u) return false
  const prefix = (u.email ?? '').split('@')[0] ?? ''
  return !handle.value && (!u.name || u.name === prefix)
})

const open = ref(false)
const imgBroken = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const btnRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
watch(image, () => {
  imgBroken.value = false
})

function items(): HTMLElement[] {
  if (!menuRef.value) return []
  return Array.from(menuRef.value.querySelectorAll<HTMLElement>('[role="menuitem"]'))
}
async function openMenu() {
  open.value = true
  await nextTick()
  items()[0]?.focus()
}
function close(refocus = false) {
  if (!open.value) return
  open.value = false
  if (refocus) btnRef.value?.focus()
}
function toggle() {
  open.value ? close() : openMenu()
}

function onDocPointer(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}
function onMenuKeydown(e: KeyboardEvent) {
  const list = items()
  if (list.length === 0) return
  const i = list.indexOf(document.activeElement as HTMLElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    list[(i + 1) % list.length]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    list[(i - 1 + list.length) % list.length]?.focus()
  } else if (e.key === 'Home') {
    e.preventDefault()
    list[0]?.focus()
  } else if (e.key === 'End') {
    e.preventDefault()
    list[list.length - 1]?.focus()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    close(true)
  }
}
onMounted(() => document.addEventListener('click', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('click', onDocPointer))

async function logout() {
  close()
  await authClient.signOut()
  await navigateTo('/')
}
</script>

<template>
  <div class="acct" ref="rootRef">
    <template v-if="loggedIn">
      <button
        ref="btnRef"
        type="button"
        class="avatar-btn"
        :class="{ nudge: needsSetup, on: open }"
        :aria-expanded="open"
        aria-haspopup="menu"
        :aria-label="`Account menu for ${displayName}`"
        @click.stop="toggle"
      >
        <img v-if="image && !imgBroken" :src="image" alt="" @error="imgBroken = true" />
        <span v-else class="mono" aria-hidden="true">{{ monogram }}</span>
        <span v-if="needsSetup" class="nudge-dot" aria-hidden="true" />
      </button>

      <Transition name="dd">
        <div v-if="open" ref="menuRef" class="menu" role="menu" @keydown="onMenuKeydown">
          <div class="menu-head">
            <span class="menu-name">{{ displayName }}</span>
            <span v-if="handle" class="menu-handle">@{{ handle }}</span>
            <span v-else class="menu-handle muted">No handle yet</span>
          </div>
          <NuxtLink
            v-if="handle"
            :to="`/u/@${handle}`"
            class="menu-item"
            role="menuitem"
            @click="close()"
          >
            View profile
          </NuxtLink>
          <NuxtLink to="/account" class="menu-item" role="menuitem" @click="close()">
            {{ needsSetup ? 'Finish your profile' : 'Edit profile' }}
          </NuxtLink>
          <NuxtLink v-if="isAdmin" to="/admin" class="menu-item admin" role="menuitem" @click="close()">
            Admin
          </NuxtLink>
          <div class="menu-sep" role="separator" />
          <button type="button" class="menu-item logout" role="menuitem" @click="logout">Log out</button>
        </div>
      </Transition>
    </template>

    <template v-else>
      <NuxtLink to="/login" class="navlink">Log in</NuxtLink>
      <NuxtLink to="/login?signup=1" class="signup-btn">Sign up</NuxtLink>
    </template>
  </div>
</template>

<style scoped>
.acct {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar-btn {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  display: grid;
  place-items: center;
  transition: box-shadow 0.12s, transform 0.1s;
}
.avatar-btn:hover {
  box-shadow: var(--shadow-sm);
}
.avatar-btn.on {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 45%, transparent);
}
.avatar-btn:focus-visible {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
.avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-btn .mono {
  font-weight: 800;
  font-size: 16px;
  color: var(--ink-soft);
  overflow: visible;
}
.nudge-dot {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--primary);
  border: 2px solid var(--bg);
}
.menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 220px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow);
  padding: 6px;
  z-index: 600;
}
.menu-head {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px 12px 10px;
  border-bottom: 1px solid var(--line-soft);
  margin-bottom: 4px;
}
.menu-name {
  font-weight: 800;
  font-size: 14px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-handle {
  font-size: 12px;
  color: var(--primary);
  font-weight: 600;
}
.menu-handle.muted {
  color: var(--mute);
}
.menu-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  padding: 9px 12px;
  border-radius: 9px;
  cursor: pointer;
  text-decoration: none;
}
.menu-item:hover,
.menu-item:focus-visible {
  background: var(--surface-2);
  outline: none;
}
.menu-item:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--primary) 55%, transparent);
}
.menu-item.admin {
  color: var(--primary);
  font-weight: 800;
}
.menu-item.logout {
  color: var(--danger, #c0392b);
}
.menu-sep {
  height: 1px;
  background: var(--line-soft);
  margin: 4px 0;
}
.dd-enter-active,
.dd-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
  transform-origin: top right;
}
.dd-enter-from,
.dd-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(-4px);
}

/* Signed-out Sign up button (moved here with the account control). Log in reuses the
   global .navlink. */
.signup-btn {
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  border-radius: 999px;
  border: var(--bd) solid var(--line);
  background: var(--ink);
  color: var(--bg);
  font-weight: 800;
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
}
.signup-btn:hover {
  opacity: 0.9;
}
</style>
