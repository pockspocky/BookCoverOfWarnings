<template>
  <span class="inline-flex items-center border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider" :class="toneClass">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
const props = defineProps<{ label: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'muted' }>()
const toneClass = computed(() => ({
  good: 'border-emerald-800 bg-emerald-950/40 text-emerald-200',
  warn: 'border-amber-800 bg-amber-950/40 text-amber-200',
  bad: 'border-red-800 bg-red-950/40 text-red-200',
  muted: 'border-ink-700 bg-ink-900 text-ink-400',
  neutral: 'border-panel-border bg-panel text-ink-200'
}[props.tone || 'neutral']))
</script>
