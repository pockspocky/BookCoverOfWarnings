<template>
  <div class="overflow-x-auto border border-panel-border">
    <table class="min-w-full text-left text-sm">
      <thead class="bg-ink-900 text-[11px] uppercase tracking-wider text-ink-400">
        <tr>
          <th v-for="col in columns" :key="col" class="border-b border-panel-border px-3 py-2 font-medium">{{ col }}</th>
        </tr>
      </thead>
      <tbody>
        <slot />
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{ columns: string[] }>()
</script>
