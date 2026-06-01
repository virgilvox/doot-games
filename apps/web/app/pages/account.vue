<script setup lang="ts">
/**
 * Owner-only profile editor. Set a public display name, claim/change an @handle
 * (the vanity URL for your profile), set an avatar, and write a short bio. The
 * email is never shown publicly: this is where you give yourself a real public
 * identity instead of the email local-part the signup uses as a default.
 *
 * Writes go through better-auth's `updateUser` (display name, avatar, bio) and
 * the username plugin (handle, set via the same call). No custom write route.
 */
import { computed, onMounted, ref, watch } from 'vue'

const session = authClient.useSession()
const user = computed(() => session.value?.data?.user ?? null)

// Auth-gate on the client (this page is interactive-only, no SSR payload needed).
if (import.meta.client && !session.value?.isPending && !user.value) {
  navigateTo('/login?redirect=/account')
}
watch(
  () => [session.value?.isPending, user.value] as const,
  ([pending, u]) => {
    if (import.meta.client && !pending && !u) navigateTo('/login?redirect=/account')
  },
)

// Handle (username) rules mirror server/utils/auth.ts: 3-24 chars, lowercase
// letters/digits/underscore, not a reserved/route-colliding word.
const HANDLE_MIN = 3
const HANDLE_MAX = 24
const RESERVED = new Set([
  'account', 'login', 'logout', 'signup', 'explore', 'create', 'host', 'play',
  'g', 'u', 'mine', 'support', 'api', 'editor', 'admin', 'doot', 'help', 'about',
])
const NAME_MAX = 40
const BIO_MAX = 280

// ---- form state, seeded from the session once it loads --------------------
const name = ref('')
const handle = ref('')
const image = ref('')
const bio = ref('')
const seeded = ref(false)
function seed() {
  const u = user.value
  if (!u || seeded.value) return
  name.value = u.name ?? ''
  handle.value = (u as { username?: string | null }).username ?? ''
  image.value = u.image ?? ''
  bio.value = (u as { bio?: string | null }).bio ?? ''
  seeded.value = true
}
watch(user, seed, { immediate: true })

const savedHandle = computed(() => (user.value as { username?: string | null })?.username ?? '')
const normHandle = computed(() => handle.value.trim().toLowerCase())
const handleChanged = computed(() => normHandle.value !== savedHandle.value)

// Whether the signup default is still in place (display name equals email prefix
// and no handle claimed) so we can nudge the user to personalize.
const looksDefault = computed(() => {
  const u = user.value
  if (!u) return false
  const prefix = (u.email ?? '').split('@')[0] ?? ''
  return !savedHandle.value && (!u.name || u.name === prefix)
})

// ---- handle validation + live availability --------------------------------
type HandleState = 'empty' | 'invalid' | 'reserved' | 'checking' | 'available' | 'taken' | 'current'
const handleState = ref<HandleState>('empty')
let checkSeq = 0

function localHandleError(h: string): HandleState | null {
  if (!h) return 'empty'
  if (h.length < HANDLE_MIN || h.length > HANDLE_MAX || !/^[a-z0-9_]+$/.test(h)) return 'invalid'
  if (RESERVED.has(h)) return 'reserved'
  return null
}

let debounce: ReturnType<typeof setTimeout> | null = null
watch(normHandle, (h) => {
  if (debounce) clearTimeout(debounce)
  if (!handleChanged.value) {
    handleState.value = savedHandle.value ? 'current' : 'empty'
    return
  }
  const local = localHandleError(h)
  if (local) {
    handleState.value = local
    return
  }
  handleState.value = 'checking'
  const seq = ++checkSeq
  debounce = setTimeout(async () => {
    try {
      const res = await authClient.isUsernameAvailable({ username: h })
      if (seq !== checkSeq) return // a newer keystroke superseded this check
      handleState.value = res.data?.available ? 'available' : 'taken'
    } catch {
      if (seq === checkSeq) handleState.value = 'invalid'
    }
  }, 350)
})

const HANDLE_MSG: Record<HandleState, string> = {
  empty: 'Pick a handle to get a shareable profile link.',
  invalid: `3 to ${HANDLE_MAX} characters: lowercase letters, numbers, or underscores.`,
  reserved: 'That handle is reserved. Try another.',
  checking: 'Checking availability…',
  available: 'Available',
  taken: 'That handle is taken. Try another.',
  current: 'This is your current handle.',
}
const handleOk = computed(() => handleState.value === 'available' || handleState.value === 'current')

// ---- avatar upload (reuse the presigned-upload flow) ----------------------
const storageConfigured = ref(false)
const uploading = ref(false)
const uploadError = ref('')
const avatarBroken = ref(false)
const upload = useImageUpload()
onMounted(async () => {
  try {
    const c = await $fetch<{ enabled: boolean }>('/api/uploads/config')
    storageConfigured.value = !!c.enabled
  } catch {
    /* leave disabled: URL paste still works */
  }
})
const canUpload = computed(() => storageConfigured.value && !!user.value)
async function onAvatarFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploading.value = true
  uploadError.value = ''
  try {
    image.value = await upload(file)
    avatarBroken.value = false
  } catch (err) {
    uploadError.value = (err as { statusMessage?: string })?.statusMessage ?? 'Upload failed.'
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
watch(image, () => {
  avatarBroken.value = false
})
const monogram = computed(() => (name.value.trim() || user.value?.email || '?').charAt(0).toUpperCase())

// ---- save -----------------------------------------------------------------
const saving = ref(false)
const error = ref('')
const saved = ref(false)
const nameError = computed(() => {
  const n = name.value.trim()
  if (!n) return 'Add a display name.'
  if (n.length > NAME_MAX) return `Keep it under ${NAME_MAX} characters.`
  return ''
})
const bioCount = computed(() => bio.value.length)
const canSave = computed(
  () => !saving.value && !nameError.value && bio.value.length <= BIO_MAX && (!handleChanged.value || handleOk.value),
)

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  saved.value = false
  const body: Record<string, string> = {
    name: name.value.trim(),
    image: image.value.trim(),
    bio: bio.value.trim(),
  }
  // Only send the handle when it actually changed (re-sending the same one is a
  // needless uniqueness round-trip; the server validates either way).
  if (handleChanged.value && normHandle.value) {
    body.username = normHandle.value
    body.displayUsername = handle.value.trim()
  }
  try {
    const res = await authClient.updateUser(body)
    if (res.error) {
      error.value = res.error.message ?? 'Could not save your profile.'
      return
    }
    saved.value = true
    // Reflect the new handle as "current" and re-pull the session so the nav and
    // byline links pick up the change.
    seeded.value = false
    await authClient.getSession({ query: { disableCookieCache: true } })
    handleState.value = savedHandle.value ? 'current' : 'empty'
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Could not save your profile.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main>
    <div class="wrap account-wrap">
      <div class="panel account-card">
        <span class="kicker">Your profile</span>
        <h1>Account</h1>
        <p class="account-note">
          This is how you appear to other people on Doot. Your email is never shown.
        </p>

        <p v-if="looksDefault" class="account-nudge" role="note">
          Add a display name and claim a handle so people can find your games.
        </p>

        <form class="account-form" @submit.prevent="save">
          <!-- Avatar -->
          <div class="sf-field">
            <span class="sf-label">Avatar</span>
            <div class="avatar-row">
              <span class="avatar" aria-hidden="true">
                <img v-if="image && !avatarBroken" :src="image" :alt="name || 'Your avatar'" @error="avatarBroken = true" />
                <span v-else class="avatar-mono">{{ monogram }}</span>
              </span>
              <div class="avatar-controls">
                <input
                  v-model="image"
                  class="sf-input"
                  type="url"
                  inputmode="url"
                  placeholder="https://… (paste an image URL)"
                  aria-label="Avatar image URL"
                />
                <label v-if="canUpload" class="upload-btn" :class="{ busy: uploading }">
                  <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" :disabled="uploading" @change="onAvatarFile" />
                  <span>{{ uploading ? 'Uploading…' : 'Upload' }}</span>
                </label>
              </div>
            </div>
            <p v-if="!storageConfigured" class="sf-hint">Paste an image URL. With no name set we show your first initial.</p>
            <p v-if="uploadError" class="sf-error">{{ uploadError }}</p>
          </div>

          <!-- Display name -->
          <label class="sf-field">
            <span class="sf-label">Display name</span>
            <input v-model="name" class="sf-input" type="text" :maxlength="NAME_MAX" placeholder="Your name" autocomplete="name" />
            <p v-if="nameError" class="sf-error">{{ nameError }}</p>
          </label>

          <!-- Handle -->
          <div class="sf-field">
            <span class="sf-label">Handle</span>
            <div class="handle-row">
              <span class="handle-at" aria-hidden="true">@</span>
              <input
                v-model="handle"
                class="sf-input handle-input"
                type="text"
                :maxlength="HANDLE_MAX"
                placeholder="yourname"
                autocapitalize="none"
                autocomplete="off"
                spellcheck="false"
                aria-label="Profile handle"
              />
            </div>
            <p
              class="handle-msg"
              :class="{ ok: handleOk, bad: ['invalid', 'reserved', 'taken'].includes(handleState) }"
              :aria-live="'polite'"
            >
              {{ HANDLE_MSG[handleState] }}
            </p>
          </div>

          <!-- Bio -->
          <label class="sf-field">
            <span class="sf-label">Bio</span>
            <textarea
              v-model="bio"
              class="sf-input account-bio"
              :maxlength="BIO_MAX"
              rows="3"
              placeholder="A line about you or the games you make."
            />
            <span class="bio-count" :class="{ over: bioCount > BIO_MAX }">{{ bioCount }} / {{ BIO_MAX }}</span>
          </label>

          <div class="account-actions">
            <button class="btn btn-primary btn-lg" type="submit" :disabled="!canSave">
              {{ saving ? 'Saving…' : 'Save profile' }}
            </button>
            <NuxtLink v-if="savedHandle" :to="`/u/@${savedHandle}`" class="btn btn-ghost btn-lg">View my public profile</NuxtLink>
          </div>
          <p v-if="error" class="sf-error" role="alert">{{ error }}</p>
          <p v-if="saved" class="account-saved" role="status">Saved.</p>
        </form>
      </div>
    </div>
  </main>
</template>

<style scoped>
.account-wrap {
  max-width: 560px;
  padding: 48px 0;
}
.account-card {
  padding: 32px;
}
.account-card h1 {
  font-size: clamp(26px, 5vw, 34px);
  font-weight: 800;
  margin-top: 6px;
}
.account-note {
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.5;
  margin: 10px 0 0;
}
.account-nudge {
  margin: 18px 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border: var(--bd) solid color-mix(in srgb, var(--primary) 30%, transparent);
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
}
.account-form {
  display: grid;
  gap: 20px;
  margin-top: 24px;
}
.avatar-row {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.avatar {
  flex: none;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  border: var(--bd) solid var(--line);
  background: var(--surface-2);
  display: grid;
  place-items: center;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-mono {
  font-size: 28px;
  font-weight: 800;
  color: var(--ink-soft);
}
.avatar-controls {
  flex: 1;
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.avatar-controls .sf-input {
  flex: 1;
}
.upload-btn {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  border-radius: 11px;
  padding: 0 14px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.upload-btn:hover {
  border-color: var(--primary);
}
.upload-btn.busy {
  opacity: 0.6;
  cursor: progress;
}
.upload-btn input {
  display: none;
}
.handle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  padding-left: 12px;
}
.handle-at {
  color: var(--mute);
  font-weight: 800;
  font-size: 16px;
}
.handle-input {
  border: none;
  background: transparent;
  padding-left: 0;
}
.handle-input:focus {
  outline: none;
}
.handle-msg {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--mute);
}
.handle-msg.ok {
  color: var(--ok, #1a8f5a);
  font-weight: 700;
}
.handle-msg.bad {
  color: var(--danger, #c0392b);
  font-weight: 700;
}
.account-bio {
  resize: vertical;
  min-height: 72px;
  font-family: inherit;
}
.bio-count {
  display: block;
  margin-top: 6px;
  font-size: 12px;
  color: var(--mute);
  text-align: right;
}
.bio-count.over {
  color: var(--danger, #c0392b);
  font-weight: 700;
}
.account-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.account-saved {
  margin: 4px 0 0;
  color: var(--ok, #1a8f5a);
  font-weight: 700;
  font-size: 14px;
}
.sf-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--mute);
}
</style>
