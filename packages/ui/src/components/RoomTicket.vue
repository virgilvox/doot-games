<script setup lang="ts">
/** The lobby join ticket: a big room code, a QR, and the join URL. */
import QrCode from './QrCode.vue'

withDefaults(defineProps<{ code: string; url: string; showQr?: boolean }>(), { showQr: true })
</script>

<template>
  <div class="ticket">
    <div class="ticket-main">
      <div class="kicker">Join at this code</div>
      <div class="big-code mono">{{ code }}</div>
      <div class="url mono">{{ url }}</div>
    </div>
    <QrCode v-if="showQr" :value="url" :size="148" />
  </div>
</template>

<style scoped>
.ticket {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  justify-content: center;
}
.big-code {
  font-weight: 700;
  font-size: clamp(56px, 11vw, 110px);
  letter-spacing: 0.16em;
  color: var(--primary);
  line-height: 1;
  padding-left: 0.16em;
}
.url {
  font-size: 13px;
  color: var(--ink-soft);
  margin-top: 10px;
  word-break: break-all;
}
</style>
