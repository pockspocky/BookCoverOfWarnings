<template>
  <div class="flex min-h-screen items-center justify-center bg-ink-950 p-6 text-ink-100">
    <div class="max-w-lg border border-panel-border bg-panel p-6">
      <p class="mono-meta uppercase">Error</p>
      <h1 class="mt-2 text-2xl font-semibold">{{ error?.statusCode || 'Request failed' }}</h1>
      <p class="mt-2 text-sm text-ink-400">{{ error?.message || 'The directory could not complete this request.' }}</p>
      <button class="mt-4 bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="clearError({ redirect: '/' })">Back to dashboard</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()
</script>
