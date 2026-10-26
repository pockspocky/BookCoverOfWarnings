<template>
  <div class="pointer-events-none fixed right-4 top-4 z-50 flex w-96 max-w-[calc(100%-2rem)] flex-col gap-2">
    <div
      v-for="item in toasts.items"
      :key="item.id"
      class="pointer-events-auto border px-3 py-2 text-sm shadow-panel"
      :class="item.tone === 'error' ? 'border-red-800 bg-red-950 text-red-100' : item.tone === 'success' ? 'border-emerald-800 bg-emerald-950 text-emerald-100' : 'border-panel-border bg-panel-raised text-ink-100'"
    >
      {{ item.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
const toasts = useToastStore()
</script>
