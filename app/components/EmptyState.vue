<template>
  <div class="border border-dashed border-panel-border bg-panel px-6 py-12 text-center">
    <p class="text-sm font-medium text-ink-200">{{ title }}</p>
    <p class="mt-2 text-sm text-ink-400">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; description: string }>()
</script>
