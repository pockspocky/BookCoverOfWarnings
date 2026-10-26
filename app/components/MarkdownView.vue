<template>
  <div class="prose-bow text-sm leading-relaxed text-ink-200" v-html="html" />
</template>

<script setup lang="ts">
import { renderMarkdown } from '../utils/markdown'

const props = defineProps<{ source?: string | null }>()
const html = computed(() => renderMarkdown(props.source))
</script>

<style scoped>
.prose-bow :deep(a) { color: #c4a35a; text-decoration: underline; }
.prose-bow :deep(p) { margin-bottom: 0.75rem; }
.prose-bow :deep(ul) { list-style: disc; padding-left: 1.2rem; }
</style>
