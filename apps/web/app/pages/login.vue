<script setup lang="ts">
/** Sign in or create an account. Auth only gates saving games — you never need
 *  it to host or play. */
import { computed, ref } from 'vue'

const route = useRoute()
const { loggedIn, fetch: refreshSession } = useUserSession()
const redirectTo = computed(() => (typeof route.query.redirect === 'string' ? route.query.redirect : '/explore'))

// Already signed in? Move along.
if (import.meta.client && loggedIn.value) navigateTo(redirectTo.value)

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(`/api/auth/${mode.value}`, {
      method: 'POST',
      body: { email: email.value, password: password.value },
    })
    await refreshSession()
    await navigateTo(redirectTo.value)
  } catch (e) {
    error.value = (e as { statusMessage?: string })?.statusMessage ?? 'Something went wrong.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main>
    <div class="wrap auth-wrap">
      <div class="panel auth-card">
        <span class="kicker">{{ mode === 'login' ? 'Welcome back' : 'Join Doot' }}</span>
        <h1>{{ mode === 'login' ? 'Sign in' : 'Create an account' }}</h1>
        <p class="auth-note">You only need an account to <strong>save</strong> games — hosting and playing are always open.</p>
        <form class="auth-form" @submit.prevent="submit">
          <label class="sf-field">
            <span class="sf-label">Email</span>
            <input v-model="email" class="sf-input" type="email" autocomplete="email" required placeholder="you@example.com" />
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
      </div>
    </div>
  </main>
</template>

<style scoped>
.auth-wrap {
  max-width: 460px;
  padding: 56px 0;
}
.auth-card {
  padding: 32px;
  text-align: center;
}
.auth-card h1 {
  font-size: clamp(26px, 5vw, 34px);
  font-weight: 800;
  margin-top: 6px;
}
.auth-note {
  color: var(--ink-soft);
  font-size: 14px;
  line-height: 1.5;
  margin: 12px 0 22px;
}
.auth-form {
  display: grid;
  gap: 14px;
  text-align: left;
}
.auth-toggle {
  margin-top: 20px;
  font-size: 14px;
  color: var(--ink-soft);
}
.linkbtn {
  background: none;
  border: none;
  color: var(--primary);
  font-weight: 700;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  padding: 0;
}
</style>
