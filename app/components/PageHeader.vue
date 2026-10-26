<template>
  <header class="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-panel-border pb-4">
    <div>
      <p v-if="kicker" class="mono-meta mb-1 uppercase">{{ kicker }}</p>
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-3xl text-sm text-ink-400">{{ description }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; kicker?: string; description?: string }>()
</script>
