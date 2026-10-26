<template>
  <nav class="mb-6 flex gap-2 overflow-auto border border-panel-border bg-panel p-2 text-sm" aria-label="Administration">
    <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="whitespace-nowrap rounded px-3 py-1.5 text-ink-300 hover:bg-ink-900 hover:text-ink-50" active-class="bg-ink-800 text-accent">
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>

<script setup lang="ts">
const items = [
  { to: '/admin', label: 'Overview' },
  { to: '/admin/administrators', label: 'Administrators' },
  { to: '/admin/submissions', label: 'Submissions' },
  { to: '/admin/categories', label: 'Categories' },
  { to: '/admin/profile-matching', label: 'Profile matching' }
]
</script>
