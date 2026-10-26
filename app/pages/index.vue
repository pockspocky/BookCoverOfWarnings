<template>
  <div>
    <PageHeader title="Directory" kicker="Dashboard" description="Authorized, published records only. Pending and rejected submissions are excluded.">
      <NuxtLink to="/search" class="border border-panel-border px-3 py-1.5 text-sm">Advanced search</NuxtLink>
      <NuxtLink to="/graph" class="bg-accent px-3 py-1.5 text-sm text-accent-fg">Open graph</NuxtLink>
    </PageHeader>
    <form class="mb-6" @submit.prevent="go">
      <label class="sr-only" for="dash-search">Global search</label>
      <input id="dash-search" v-model="q" class="w-full border border-panel-border bg-panel px-4 py-3 text-lg" placeholder="Search across students, groups, traits, relationships…" />
    </form>
    <div v-if="pending" class="grid gap-3 md:grid-cols-5"><div v-for="n in 5" :key="n" class="h-24 animate-pulse bg-ink-800" /></div>
    <div v-else class="grid gap-3 md:grid-cols-5">
      <NuxtLink v-for="card in cards" :key="card.to" :to="card.to" class="border border-panel-border bg-panel p-4 hover:border-accent">
        <p class="mono-meta uppercase">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-semibold">{{ card.value }}</p>
      </NuxtLink>
    </div>
    <section class="mt-8">
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Recent approved updates</h2>
      <EmptyState v-if="!recent.length" title="No recent updates" description="Published revision history will appear here." />
      <ul v-else class="divide-y divide-panel-border border border-panel-border">
        <li v-for="item in recent" :key="item.id">
          <NuxtLink :to="item.href" class="block px-4 py-3 hover:bg-ink-900">
            <p class="text-sm">{{ item.title }}</p>
            <p class="mono-meta">{{ item.occurredAt }} · {{ item.entityType }}</p>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const q = ref('')
const pending = ref(true)
const stats = ref({ students: 0, groups: 0, traits: 0, evidence: 0, relationships: 0 })
const recent = ref<Awaited<ReturnType<typeof $api.dashboard.recent>>>([])

const cards = computed(() => [
  { label: 'Students', value: stats.value.students, to: '/students' },
  { label: 'Groups', value: stats.value.groups, to: '/groups' },
  { label: 'Traits', value: stats.value.traits, to: '/traits' },
  { label: 'Evidence', value: stats.value.evidence, to: '/evidence' },
  { label: 'Relationships', value: stats.value.relationships, to: '/relationships' }
])

onMounted(async () => {
  const [s, r] = await Promise.all([$api.dashboard.stats(), $api.dashboard.recent()])
  stats.value = s
  recent.value = r
  pending.value = false
})

function go() {
  navigateTo({ path: '/search', query: { q: q.value } })
}
</script>
