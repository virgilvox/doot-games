<script setup lang="ts">
/** The player join form: room code + display name, with validation. */
import { isValidRoomCode } from '@doot-games/engine'
import { onMounted, ref } from 'vue'
import DButton from './DButton.vue'

const props = withDefaults(defineProps<{ initialCode?: string; initialName?: string }>(), {
  initialCode: '',
  initialName: '',
})
const emit = defineEmits<{ join: [payload: { code: string; name: string }] }>()

const code = ref(props.initialCode.toUpperCase())
const name = ref(props.initialName)
const error = ref('')

// Land the cursor where the player actually needs to type: if they arrived via a
// QR scan / deep link the code is already filled, so jump straight to the name;
// otherwise focus the code field. Saves a tap in the most common (QR) path.
const codeInput = ref<HTMLInputElement | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  const target = isValidRoomCode(code.value) ? nameInput.value : codeInput.value
  target?.focus()
})

function submit() {
  const c = code.value.trim().toUpperCase()
  const n = name.value.trim()
  if (!isValidRoomCode(c)) {
    error.value = 'Enter the 4-character room code.'
    return
  }
  if (!n) {
    error.value = 'Pick a name so others know who you are.'
    return
  }
  error.value = ''
  emit('join', { code: c, name: n })
}
</script>

<template>
  <form class="join-form" @submit.prevent="submit">
    <label class="fld">
      <span>Room code</span>
      <input
        ref="codeInput"
        v-model="code"
        class="input code mono"
        maxlength="4"
        autocapitalize="characters"
        autocorrect="off"
        spellcheck="false"
        autocomplete="off"
        aria-label="Room code"
        placeholder="ABCD"
        @input="code = code.toUpperCase()"
      />
    </label>
    <label class="fld">
      <span>Your name</span>
      <input
        ref="nameInput"
        v-model="name"
        class="input"
        maxlength="18"
        autocomplete="off"
        aria-label="Your display name"
        placeholder="e.g. Robin"
        @keyup.enter="submit"
      />
    </label>
    <DButton variant="primary" type="submit" block>Join game</DButton>
    <p v-if="error" class="err" role="alert">{{ error }}</p>
  </form>
</template>

<style scoped>
.join-form {
  display: grid;
  gap: 12px;
  text-align: left;
}
.fld span {
  display: block;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mute);
  font-weight: 700;
  margin-bottom: 6px;
}
.input {
  width: 100%;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  color: var(--ink);
  border-radius: 11px;
  padding: 13px 14px;
  font-size: 16px;
  font-weight: 600;
  font-family: inherit;
}
.input:focus {
  outline: none;
  border-color: var(--primary);
}
.code {
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 22px;
  text-align: center;
}
.err {
  text-align: center;
  font-size: 13px;
  color: var(--primary);
  margin: 0;
}
</style>
