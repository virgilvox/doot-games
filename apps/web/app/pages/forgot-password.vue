<script setup lang="ts">
/** Ask for a password-reset email. The reply is the same whether or not the
 *  address has an account, so this page can't be used to discover accounts. */
import { ref } from 'vue'

useHead({ title: 'Reset your password · Doot' })

const route = useRoute()
const email = ref(typeof route.query.email === 'string' ? route.query.email : '')
const busy = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  const res = await authClient.requestPasswordReset({ email: email.value.trim() })
  busy.value = false
  if (res.error) {
    // Only real failures land here (rate limit, network); "no such account" does not.
    error.value =
      res.error.status === 429
        ? 'Too many tries. Wait a minute, then try again.'
        : (res.error.message ?? 'Something went wrong. Try again in a moment.')
    return
  }
  sent.value = true
}
</script>

<template>
  <AuthCard kicker="Locked out?" title="Reset your password">
    <template v-if="!sent">
      <p class="auth-note">Enter the email you signed up with. We'll send a link to choose a new password.</p>
      <form class="auth-form" @submit.prevent="submit">
        <label class="sf-field">
          <span class="sf-label">Email</span>
          <input v-model="email" class="sf-input" type="email" autocomplete="username" required placeholder="you@example.com" />
        </label>
        <button class="btn btn-primary btn-lg btn-block" type="submit" :disabled="busy">
          {{ busy ? 'Sending…' : 'Send reset link' }}
        </button>
        <p v-if="error" class="sf-error" role="alert">{{ error }}</p>
      </form>
    </template>
    <div v-else role="status">
      <p class="auth-done">
        If <strong>{{ email.trim() }}</strong> has a Doot account, a reset link is on its way. It works once, for 1 hour.
      </p>
      <p class="auth-note">Nothing after a few minutes? Check your spam folder, or make sure that's the address you signed up with.</p>
    </div>
    <p class="auth-toggle">
      Remembered it?
      <NuxtLink class="linkbtn" to="/login">Back to sign in</NuxtLink>
    </p>
  </AuthCard>
</template>
