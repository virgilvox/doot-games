<script setup lang="ts">
/**
 * OAuth consent screen for the "Connect with Claude" flow. The better-auth mcp /
 * oidc provider redirects the (already signed-in) user here with consent_code,
 * client_id, and scope in the query. We show what is being granted, then POST the
 * decision to /api/auth/oauth2/consent and follow the returned redirectURI back to
 * the app that started the flow.
 */
const route = useRoute()
const consentCode = computed(() => String(route.query.consent_code ?? ''))
const scopes = computed(() =>
  String(route.query.scope ?? '')
    .split(/[+\s]+/)
    .filter(Boolean),
)
const busy = ref(false)
const err = ref('')

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Confirm who you are',
  profile: 'Read your basic profile (name, avatar)',
  email: 'Read your email address',
  offline_access: 'Stay connected so it can keep building games',
}
function scopeLabel(s: string) {
  return SCOPE_LABELS[s] ?? s
}

async function decide(accept: boolean) {
  busy.value = true
  err.value = ''
  try {
    const res = await $fetch<{ redirectURI?: string }>('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept, consent_code: consentCode.value || undefined },
    })
    if (res?.redirectURI) {
      window.location.href = res.redirectURI
      return
    }
    err.value = 'No redirect was returned. Start the connection again from the app.'
  } catch (e: unknown) {
    const msg = (e as { data?: { message?: string }; message?: string })?.data?.message
    err.value = msg || 'Could not complete this. Make sure you are signed in to Doot, then try again.'
  } finally {
    busy.value = false
  }
}

useHead({ title: 'Authorize' })
</script>

<template>
  <main>
    <div class="wrap consent">
      <div class="card">
        <span class="kicker">Authorize</span>
        <h1>Connect to your Doot account</h1>
        <p class="lead">An app wants to build and save games to your Doot account. It can only do what you allow here.</p>

        <ul class="scopes">
          <li v-for="s in scopes" :key="s">{{ scopeLabel(s) }}</li>
          <li>Save games it builds to your account (as private drafts)</li>
        </ul>

        <p v-if="err" class="err" role="alert">{{ err }}</p>

        <div class="actions">
          <button type="button" class="btn btn-primary btn-lg" :disabled="busy" @click="decide(true)">Allow</button>
          <button type="button" class="btn btn-ghost btn-lg" :disabled="busy" @click="decide(false)">Deny</button>
        </div>
        <p class="fine">You can remove access later from your account settings.</p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.consent {
  max-width: 480px;
}
.card {
  margin: 56px auto 48px;
  background: var(--surface);
  border: var(--bd) solid var(--line);
  border-radius: var(--radius-lg);
  padding: 30px 28px;
  box-shadow: var(--shadow);
}
.card h1 {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.01em;
  margin-top: 6px;
}
.lead {
  color: var(--ink-soft);
  margin-top: 8px;
  line-height: 1.5;
}
.scopes {
  list-style: none;
  padding: 0;
  margin: 18px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scopes li {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  font-size: 14px;
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.actions .btn {
  flex: 1;
}
.err {
  color: var(--c2, #c0392b);
  font-size: 14px;
  margin: 8px 0;
}
.fine {
  color: var(--mute);
  font-size: 12px;
  text-align: center;
  margin-top: 14px;
}
</style>
