<script setup lang="ts">
/**
 * Post-game "report this game" control, shown on the results screen. A player taps
 * it, picks a reason (and optionally adds a note), and it files an anonymous report
 * to `/api/reports` for a moderator to triage. No account needed.
 *
 * Self-contained: it posts with the global `fetch` (a relative URL works in the
 * browser) so it carries no dependency on the Nuxt shell. The reason keys mirror
 * the server's REPORT_REASONS (apps/web/server/utils/db.ts); keep them in sync.
 */
import { Icon } from '@doot-games/ui'
import { ref } from 'vue'

const props = defineProps<{
  /** The live room's join code, kept as a breadcrumb for the moderator. */
  roomCode?: string | null
  /** The game's title + type, so a moderator can find a saved/public game. */
  gameTitle?: string | null
  pluginId?: string | null
}>()

const REASONS: Array<{ key: string; label: string }> = [
  { key: 'offensive', label: 'Hateful or offensive' },
  { key: 'sexual', label: 'Sexual or explicit' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'spam', label: 'Spam or off-topic' },
  { key: 'other', label: 'Something else' },
]

const open = ref(false)
const reason = ref('')
const detail = ref('')
const busy = ref(false)
const done = ref(false)
const error = ref('')

function toggle() {
  open.value = !open.value
  if (!open.value) reset()
}
function reset() {
  reason.value = ''
  detail.value = ''
  error.value = ''
}

async function submit() {
  if (!reason.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: reason.value,
        detail: detail.value.trim() || undefined,
        roomCode: props.roomCode || undefined,
        gameTitle: props.gameTitle || undefined,
        pluginId: props.pluginId || undefined,
      }),
    })
    if (!res.ok) throw new Error(String(res.status))
    done.value = true
    open.value = false
  } catch {
    error.value = "That didn't send. Check your connection and try again."
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="report">
    <p v-if="done" class="report-thanks" role="status">
      <Icon name="flag" :size="15" /> Thanks. A moderator will take a look.
    </p>
    <template v-else>
      <button type="button" class="report-trigger" :aria-expanded="open" @click="toggle">
        <Icon name="flag" :size="15" />
        <span>{{ open ? 'Never mind' : 'Report this game' }}</span>
      </button>

      <div v-if="open" class="report-panel">
        <p class="report-title">What's wrong with this game?</p>
        <div class="report-reasons" role="radiogroup" aria-label="Reason for reporting">
          <label v-for="r in REASONS" :key="r.key" class="report-reason" :class="{ on: reason === r.key }">
            <input v-model="reason" type="radio" name="doot-report-reason" :value="r.key" />
            <span>{{ r.label }}</span>
          </label>
        </div>
        <textarea
          v-model="detail"
          class="report-detail"
          rows="2"
          maxlength="1000"
          placeholder="Add a note (optional)"
        />
        <p v-if="error" class="report-error" role="alert">{{ error }}</p>
        <button
          type="button"
          class="btn btn-primary btn-block report-send"
          :disabled="!reason || busy"
          @click="submit"
        >
          {{ busy ? 'Sending…' : 'Send report' }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.report {
  text-align: center;
}
.report-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--mute);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
}
.report-trigger:hover {
  color: var(--ink-soft);
}
.report-panel {
  margin: 8px auto 0;
  max-width: 380px;
  text-align: left;
  background: var(--surface);
  border: var(--bd) solid var(--line-soft);
  border-radius: 14px;
  padding: 16px;
}
.report-title {
  font-weight: 700;
  margin-bottom: 10px;
}
.report-reasons {
  display: grid;
  gap: 6px;
}
.report-reason {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 12px;
  border: var(--bd) solid var(--line-soft);
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}
.report-reason.on {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
}
.report-reason input {
  accent-color: var(--primary);
  flex: none;
}
.report-detail {
  margin-top: 10px;
  width: 100%;
  resize: vertical;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 10px;
  padding: 9px 11px;
  font: inherit;
  font-size: 14px;
  color: var(--ink);
}
.report-error {
  margin-top: 8px;
  color: var(--danger, #d33);
  font-size: 13px;
  font-weight: 600;
}
.report-send {
  margin-top: 12px;
}
.report-thanks {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 600;
}
</style>
