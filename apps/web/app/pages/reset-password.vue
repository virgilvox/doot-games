<script setup lang="ts">
/**
 * Choose a new password from an emailed reset link: /reset-password#token=...
 *
 * The token arrives in the URL fragment (never sent to a server) and is wiped from
 * the address bar as soon as it is read, so it doesn't linger in history, get
 * shared by copy-paste, or leak through a Referer. A successful reset signs the
 * account out everywhere (and revokes Claude access); the user then signs in.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

useHead({
  title: 'Choose a new password · Doot',
  meta: [{ name: 'referrer', content: 'no-referrer' }],
})

type Stage = 'loading' | 'form' | 'invalid' | 'done'
const stage = ref<Stage>('loading')
const token = ref('')
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const error = ref('')

/** Read the token from the fragment, then wipe it from the address bar. Also runs
 *  on `hashchange`: opening the emailed link again in a tab already on this page
 *  only changes the hash, which doesn't remount the page. */
function readToken() {
  if (!window.location.hash) return
  const params = new URLSearchParams(window.location.hash.slice(1))
  token.value = params.get('token') ?? ''
  history.replaceState(history.state, '', window.location.pathname)
  error.value = ''
  stage.value = token.value ? 'form' : 'invalid'
}

onMounted(() => {
  readToken()
  if (stage.value === 'loading') stage.value = 'invalid'
  window.addEventListener('hashchange', readToken)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', readToken))

async function submit() {
  if (busy.value) return
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = "The two passwords don't match."
    return
  }
  busy.value = true
  const res = await authClient.resetPassword({ newPassword: password.value, token: token.value })
  busy.value = false
  if (res.error) {
    if (res.error.code === 'INVALID_TOKEN') {
      stage.value = 'invalid'
      return
    }
    error.value =
      res.error.status === 429
        ? 'Too many tries. Wait a minute, then try again.'
        : (res.error.message ?? 'Something went wrong. Try again in a moment.')
    return
  }
  token.value = ''
  password.value = ''
  confirm.value = ''
  stage.value = 'done'
}
</script>

<template>
  <AuthCard kicker="Almost there" :title="stage === 'done' ? 'Password updated' : 'Choose a new password'">
    <p v-if="stage === 'loading'" class="auth-note" aria-live="polite">Checking your link…</p>

    <template v-else-if="stage === 'form'">
      <p class="auth-note">Pick something you haven't used here before. You'll sign in with it next.</p>
      <form class="auth-form" @submit.prevent="submit">
        <label class="sf-field">
          <span class="sf-label">New password</span>
          <input
            v-model="password"
            class="sf-input"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
            placeholder="At least 8 characters"
          />
        </label>
        <label class="sf-field">
          <span class="sf-label">Type it again</span>
          <input
            v-model="confirm"
            class="sf-input"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
          />
        </label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="busy">
          {{ busy ? 'Saving…' : 'Save new password' }}
        </button>
        <p v-if="error" class="sf-error" role="alert">{{ error }}</p>
      </form>
    </template>

    <div v-else-if="stage === 'invalid'" role="alert">
      <p class="auth-done">This reset link has expired or was already used.</p>
      <p class="auth-note">Links work once, for 1 hour. You can ask for a fresh one.</p>
      <NuxtLink class="btn btn-primary btn-lg btn-block" to="/forgot-password">Send a new link</NuxtLink>
    </div>

    <div v-else role="status">
      <p class="auth-done">Your password is changed. For safety, every device that was signed in has been signed out.</p>
      <NuxtLink class="btn btn-primary btn-lg btn-block" to="/login">Sign in</NuxtLink>
    </div>
  </AuthCard>
</template>
