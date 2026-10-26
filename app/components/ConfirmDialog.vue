<template>
  <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
    <div role="dialog" aria-modal="true" class="w-full max-w-md border border-panel-border bg-panel-raised p-5 shadow-panel">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p class="mt-2 text-sm text-ink-300">{{ message }}</p>
      <div class="mt-5 flex justify-end gap-2">
        <button class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="$emit('cancel')">Cancel</button>
        <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="$emit('confirm')">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ open: boolean; title: string; message: string; confirmLabel?: string }>(), {
  confirmLabel: 'Confirm'
})
defineEmits<{ cancel: []; confirm: [] }>()
</script>
