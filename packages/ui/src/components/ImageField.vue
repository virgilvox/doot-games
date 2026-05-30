<script setup lang="ts">
/**
 * Image field for the editor: paste a URL, or, when the app injects an
 * uploader (see `upload.ts`), pick a file to upload. Always shows a live
 * preview. With no uploader configured it's URL-only, so the library and dev
 * both work without object storage.
 */
import { computed, inject, ref } from 'vue'
import { IMAGE_UPLOAD } from '../upload'

defineProps<{ modelValue: string; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const broken = ref(false)
const uploadCtx = inject(IMAGE_UPLOAD, null)
const canUpload = computed(() => !!uploadCtx?.enabled.value)
const uploading = ref(false)
const uploadError = ref('')

async function onFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !uploadCtx) return
  uploading.value = true
  uploadError.value = ''
  broken.value = false
  try {
    const url = await uploadCtx.upload(file)
    emit('update:modelValue', url)
  } catch (err) {
    uploadError.value = (err as { statusMessage?: string })?.statusMessage ?? 'Upload failed.'
  } finally {
    uploading.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<template>
  <div class="sf-field">
    <span class="sf-label">{{ label }}</span>
    <div class="if-row">
      <input
        class="sf-input"
        type="url"
        inputmode="url"
        placeholder="https://… (paste an image URL)"
        :value="modelValue"
        @input="broken = false; emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <label v-if="canUpload" class="if-upload" :class="{ busy: uploading }">
        <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" :disabled="uploading" @change="onFile" />
        <span>{{ uploading ? 'Uploading…' : 'Upload' }}</span>
      </label>
    </div>
    <p v-if="uploadError" class="sf-error">{{ uploadError }}</p>
    <div v-if="modelValue" class="sf-image-preview">
      <img v-if="!broken" :src="modelValue" alt="Preview of the round image" @error="broken = true" />
      <span v-else class="sf-image-broken">Couldn't load that image URL.</span>
    </div>
  </div>
</template>

<style scoped>
.if-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.if-row .sf-input {
  flex: 1;
}
.if-upload {
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
.if-upload:hover {
  border-color: var(--primary);
}
.if-upload.busy {
  opacity: 0.6;
  cursor: progress;
}
.if-upload input {
  display: none;
}
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
