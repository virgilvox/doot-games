<script setup lang="ts">
/** Sign in or create an account. Auth only gates saving games, you never need
 *  it to host or play. */
import { computed, ref } from 'vue'

const route = useRoute()
const session = authClient.useSession()
const redirectTo = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/explore'))

// Already signed in? Move along.
if (import.meta.client && session.value?.data?.user) navigateTo(redirectTo.value)

// Open in register mode when arriving from a "Sign up" CTA (?signup=1 or ?mode=register).
const mode = ref<'login' | 'register'>(
  route.query.signup != null || route.query.mode === 'register' ? 'register' : 'login',
)
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)
// Carry a typed email over to the reset page so they don't retype it.
const forgotLink = computed(() => (email.value ? { path: '/forgot-password', query: { email: email.value } } : '/forgot-password'))

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const res =
    mode.value === 'register'
      ? await authClient.signUp.email({ email: email.value, password: password.value, name: email.value.split('@')[0] || 'Player' })
      : await authClient.signIn.email({ email: email.value, password: password.value })
  busy.value = false
  if (res.error) {
    error.value = res.error.message ?? 'Something went wrong.'
    return
  }
  await navigateTo(redirectTo.value)
}
</script>

<template>
  <AuthCard :kicker="mode === 'login' ? 'Welcome back' : 'Join Doot'" :title="mode === 'login' ? 'Sign in' : 'Create an account'">
    <p class="auth-note">You only need an account to <strong>save</strong> games, hosting and playing are always open.</p>
    <form class="auth-form" @submit.prevent="submit">
      <label class="sf-field">
        <span class="sf-label">Email</span>
        <!-- autocomplete="username" (not "email") is what password managers key a
             saved credential on; type="email" still gives the email keyboard. -->
        <input v-model="email" class="sf-input" type="email" autocomplete="username" required placeholder="you@example.com" />
      </label>
      <label class="sf-field">
        <span class="sf-label">Password</span>
        <input
          v-model="password"
          class="sf-input"
          type="password"
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          required
          minlength="8"
          placeholder="At least 8 characters"
        />
      </label>
      <NuxtLink v-if="mode === 'login'" class="linkbtn auth-forgot" :to="forgotLink">Forgot password?</NuxtLink>
      <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="busy">
        {{ busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account' }}
      </button>
      <p v-if="error" class="sf-error" role="alert">{{ error }}</p>
    </form>
    <p class="auth-toggle">
      <template v-if="mode === 'login'">
        New here?
        <button type="button" class="linkbtn" @click="mode = 'register'; error = ''">Create an account</button>
      </template>
      <template v-else>
        Already have an account?
        <button type="button" class="linkbtn" @click="mode = 'login'; error = ''">Sign in</button>
      </template>
    </p>
  </AuthCard>
</template>
