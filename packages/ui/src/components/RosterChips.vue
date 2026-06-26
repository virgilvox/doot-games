<script setup lang="ts">
/** A wrap of player pills for the lobby roster. When teams are on, each player's
 *  pill is tinted by their team colour (and shows the team name), so the host can
 *  see the split at a glance. */
import { computed } from 'vue'
import { teamColor } from '../visuals'
import Avatar from './Avatar.vue'
import Icon from './Icon.vue'

interface RosterPlayer {
  id: string
  name: string
  team?: string
}
const props = withDefaults(
  defineProps<{ players: RosterPlayer[]; emptyText?: string; teams?: string[]; kickable?: boolean }>(),
  { emptyText: 'No one has joined yet, share the code!', teams: () => [], kickable: false },
)
// When `kickable` (host context), each pill gets a remove button; the parent confirms
// and calls the engine. Kept opt-in so player/spectator rosters show no controls.
const emit = defineEmits<{ kick: [pid: string] }>()

/** team name -> its accent colour, by index in the configured team list. */
const colorOf = computed<Record<string, string>>(() => {
  const out: Record<string, string> = {}
  props.teams.forEach((t, i) => {
    out[t] = teamColor(i)
  })
  return out
})
function tint(team?: string): string | undefined {
  return team ? colorOf.value[team] : undefined
}
</script>

<template>
  <div class="roster">
    <span v-if="!players.length" class="empty">{{ emptyText }}</span>
    <span
      v-for="p in players"
      :key="p.id"
      class="pill"
      :class="{ teamed: !!tint(p.team) }"
      :style="tint(p.team) ? { '--team': tint(p.team) } : undefined"
    >
      <Avatar :name="p.name" :id="p.id" :size="28" />
      {{ p.name }}
      <span v-if="p.team" class="team-tag">{{ p.team }}</span>
      <button
        v-if="kickable"
        type="button"
        class="kick"
        :aria-label="`Remove ${p.name} from the game`"
        :title="`Remove ${p.name}`"
        @click="emit('kick', p.id)"
      >
        <Icon name="close" :size="13" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.roster {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 48px;
  align-items: center;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  background: var(--surface-2);
  border: var(--bd) solid var(--line-soft);
  border-radius: 999px;
  padding: 5px 14px 5px 5px;
  font-weight: 700;
  animation: pill-pop 0.25s ease;
}
.pill.teamed {
  border-color: var(--team);
  background: color-mix(in srgb, var(--team) 14%, var(--surface-2));
}
.kick {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 1px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--mute);
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.kick:hover {
  background: color-mix(in srgb, var(--danger, #c0392b) 16%, transparent);
  color: var(--danger, #c0392b);
}
.team-tag {
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--team, var(--ink-soft));
  background: var(--surface);
  border-radius: 999px;
  padding: 2px 8px;
}
.empty {
  color: var(--mute);
  font-style: italic;
}
@keyframes pill-pop {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
