<script setup lang="ts">
/**
 * Image field for the editor: a URL input with a live preview. Presigned
 * uploads to Spaces/MinIO are a separate roadmap item; until then a host pastes
 * an image URL and sees it immediately. Swapping in an uploader later only
 * changes how `modelValue` gets set.
 */
import { ref } from 'vue'

defineProps<{ modelValue: string; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const broken = ref(false)
</script>

<template>
  <label class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <input
      class="sf-input"
      type="url"
      inputmode="url"
      placeholder="https://… (paste an image URL)"
      :value="modelValue"
      @input="broken = false; emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <div v-if="modelValue" class="sf-image-preview">
      <img
        v-if="!broken"
        :src="modelValue"
        alt="Preview of the round image"
        @error="broken = true"
      />
      <span v-else class="sf-image-broken">Couldn't load that image URL.</span>
    </div>
  </label>
</template>

<style scoped>
.sf-image-preview {
  margin-top: 10px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 11px;
  overflow: hidden;
  background: var(--surface-2);
  display: grid;
  place-items: center;
  min-height: 64px;
}
.sf-image-preview img {
  max-width: 100%;
  max-height: 220px;
  display: block;
}
.sf-image-broken {
  padding: 18px;
  font-size: 13px;
  color: var(--mute);
}
</style>
