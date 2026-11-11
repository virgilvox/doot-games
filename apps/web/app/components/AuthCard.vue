<script setup lang="ts">
/** The centered card shared by the sign-in, forgot-password and reset-password
 *  pages. The form inside uses the `auth-*` classes styled here. */
defineProps<{ kicker: string; title: string }>()
</script>

<template>
  <main>
    <div class="wrap auth-wrap">
      <div class="panel auth-card">
        <span class="kicker">{{ kicker }}</span>
        <h1>{{ title }}</h1>
        <slot />
      </div>
    </div>
  </main>
</template>

<!-- Not scoped: these classes style the slotted form content of every auth page. -->
<style>
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
.auth-forgot {
  justify-self: end;
  margin-top: -6px;
  font-size: 13px;
}
.auth-done {
  color: var(--ink);
  font-size: 15px;
  line-height: 1.55;
  margin: 12px 0 8px;
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
  text-decoration: none;
}
.linkbtn:hover,
.linkbtn:focus-visible {
  text-decoration: underline;
}
</style>
