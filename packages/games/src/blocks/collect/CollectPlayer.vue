<script setup lang="ts">
/** Phone input for Collect: pick a photo (downscaled on-device before it rides the
 *  relay) or type a short line. Controlled via v-model. */
import { compressPhoto } from '@doot-games/ui'
import { ref } from 'vue'
import type { CollectContent, CollectInput } from './block'

defineProps<{ content: CollectContent; modelValue: CollectInput; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: CollectInput] }>()

const busy = ref(false)
const error = ref('')

async function onPick(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    emit('update:modelValue', { media: await compressPhoto(file) })
  } catch {
    error.value = 'Could not read that image. Try another.'
  } finally {
    busy.value = false
  }
}
function onText(e: Event) {
  emit('update:modelValue', { text: (e.target as HTMLTextAreaElement).value })
}
</script>

<template>
  <div class="collect">
    <textarea
      v-if="content.kind === 'text'"
      class="collect-text"
      :value="modelValue.text ?? ''"
      :disabled="disabled"
      rows="3"
      placeholder="Type your answer…"
      @input="onText"
    />
    <template v-else>
      <label class="collect-pick" :class="{ done: !!modelValue.media }">
        <img v-if="modelValue.media" :src="modelValue.media" alt="Your photo" class="collect-preview" />
        <span v-else class="collect-cta">{{ busy ? 'Preparing…' : '+ Tap to add a photo' }}</span>
        <input type="file" accept="image/*" capture="environment" class="visually-hidden" :disabled="disabled || busy" @change="onPick" />
      </label>
      <p v-if="modelValue.media" class="collect-hint">Tap the photo to swap it.</p>
      <p v-if="error" class="collect-err">{{ error }}</p>
    </template>
  </div>
</template>

<style scoped>
.collect {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.collect-text {
  font: inherit;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: var(--bd) solid var(--line-soft);
  background: var(--surface);
  color: var(--ink);
  resize: vertical;
}
.collect-pick {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: var(--bd) dashed var(--line);
  border-radius: var(--radius);
  background: var(--surface-2);
  cursor: pointer;
  overflow: hidden;
}
.collect-pick.done {
  border-style: solid;
  padding: 0;
}
.collect-preview {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
  display: block;
}
.collect-cta {
  font-weight: 800;
  color: var(--primary);
}
.collect-hint {
  font-size: 13px;
  color: var(--mute);
  margin: 0;
  text-align: center;
}
.collect-err {
  font-size: 13px;
  color: var(--primary);
  margin: 0;
}
</style>
