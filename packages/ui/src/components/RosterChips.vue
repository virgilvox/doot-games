<script setup lang="ts">
/** A wrap of player pills for the lobby roster. */
import Avatar from './Avatar.vue'

interface RosterPlayer {
  id: string
  name: string
}
withDefaults(defineProps<{ players: RosterPlayer[]; emptyText?: string }>(), {
  emptyText: 'No one has joined yet — share the code!',
})
</script>

<template>
  <div class="roster">
    <span v-if="!players.length" class="empty">{{ emptyText }}</span>
    <span v-for="p in players" :key="p.id" class="pill">
      <Avatar :name="p.name" :id="p.id" :size="28" />
      {{ p.name }}
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
