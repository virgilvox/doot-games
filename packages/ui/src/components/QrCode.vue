<script setup lang="ts">
/** Renders a QR code (as a data-URL image) for a join link. */
import QRCode from 'qrcode'
import { ref, watchEffect } from 'vue'

const props = withDefaults(defineProps<{ value: string; size?: number }>(), { size: 160 })
const src = ref('')

watchEffect(async () => {
  if (!props.value) {
    src.value = ''
    return
  }
  try {
    src.value = await QRCode.toDataURL(props.value, { width: props.size, margin: 1 })
  } catch {
    src.value = ''
  }
})
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :width="size"
    :height="size"
    class="qr"
    alt="QR code — scan to join the room"
  />
</template>

<style scoped>
.qr {
  border-radius: 12px;
  border: var(--bd) solid var(--line);
  background: #fff;
  padding: 6px;
}
</style>
