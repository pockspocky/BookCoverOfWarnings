<template>
  <ol class="space-y-3">
    <li v-for="item in items" :key="item.id" class="border-l border-accent/40 pl-4">
      <p class="mono-meta">{{ item.changedAt }} · v{{ item.version }}</p>
      <p class="text-sm">{{ JSON.stringify(item.previousValues) }} → {{ JSON.stringify(item.newValues) }}</p>
    </li>
  </ol>
</template>

<script setup lang="ts">
import type { VersionHistoryEntry } from '../../lib/types'
defineProps<{ items: VersionHistoryEntry[] }>()
</script>
