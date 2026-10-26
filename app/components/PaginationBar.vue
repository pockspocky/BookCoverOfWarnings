<template>
  <div class="mt-4 flex items-center justify-between text-sm">
    <p class="mono-meta">{{ meta.total }} records · page {{ meta.page }}/{{ meta.totalPages }}</p>
    <div class="flex gap-2">
      <button class="border border-panel-border px-2 py-1 disabled:opacity-40" type="button" :disabled="meta.page <= 1" @click="$emit('page', meta.page - 1)">Prev</button>
      <button class="border border-panel-border px-2 py-1 disabled:opacity-40" type="button" :disabled="meta.page >= meta.totalPages" @click="$emit('page', meta.page + 1)">Next</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaginationMeta } from '../../lib/types'
defineProps<{ meta: PaginationMeta }>()
defineEmits<{ page: [number] }>()
</script>
