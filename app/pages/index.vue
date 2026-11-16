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
    <section class="mt-8" aria-labelledby="recent-updates-heading">
      <h2 id="recent-updates-heading" class="text-lg font-semibold">Recently updated</h2>
      <p class="mt-1 max-w-3xl text-sm text-ink-400">Where a published record changed, and what changed. Pending and rejected submissions are not listed.</p>
      <div v-if="pending" class="mt-4 space-y-2">
        <div v-for="n in 4" :key="n" class="h-16 animate-pulse bg-ink-800" />
      </div>
      <EmptyState v-else-if="recentError" class="mt-4" title="Could not load recent updates" :description="recentError" />
      <EmptyState v-else-if="!recent.length" class="mt-4" title="No published changes yet" description="Additions and edits appear here after they are published." />
      <ol v-else class="mt-4 divide-y divide-panel-border border border-panel-border bg-panel">
        <li v-for="item in recent" :key="item.id">
          <NuxtLink :to="item.href" class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-ink-900/40">
            <div class="min-w-0">
              <p class="mono-meta uppercase">{{ placeLabel(item.entityType) }}</p>
              <p class="mt-1 font-medium">{{ item.title }}</p>
              <p class="text-sm text-ink-300">{{ item.summary }}</p>
            </div>
            <time class="mono-meta shrink-0" :datetime="item.occurredAt">{{ formatWhen(item.occurredAt) }}</time>
          </NuxtLink>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { RecentUpdate } from '../../lib/types'
import { errorMessage } from '../utils/errors'

const { $api } = useNuxtApp()
const q = ref('')
const pending = ref(true)
const recentError = ref('')
const stats = ref({ students: 0, groups: 0, traits: 0, evidence: 0, relationships: 0 })
const recent = ref<RecentUpdate[]>([])

const places: Record<string, string> = {
  student: 'Students',
  group: 'Groups',
  trait: 'Traits',
  evidence: 'Evidence',
  relationship: 'Relationships',
  group_membership: 'Groups',
  trait_category: 'Trait categories',
  relationship_type: 'Relationship types',
  group_role: 'Group roles'
}

const cards = computed(() => [
  { label: 'Students', value: stats.value.students, to: '/students' },
  { label: 'Groups', value: stats.value.groups, to: '/groups' },
  { label: 'Traits', value: stats.value.traits, to: '/traits' },
  { label: 'Evidence', value: stats.value.evidence, to: '/evidence' },
  { label: 'Relationships', value: stats.value.relationships, to: '/relationships' }
])

function placeLabel(entityType: string) {
  return places[entityType] ?? entityType.replaceAll('_', ' ')
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

let requestId = 0

async function loadDashboard() {
  const request = ++requestId
  try {
    const [nextStats, nextRecent] = await Promise.all([
      $api.dashboard.stats(),
      $api.dashboard.recent()
    ])
    if (request !== requestId) return
    stats.value = nextStats
    recent.value = nextRecent
    recentError.value = ''
  } catch (error) {
    if (request !== requestId) return
    if (!recent.value.length) recentError.value = errorMessage(error)
  } finally {
    if (request === requestId) pending.value = false
  }
}

function refreshIfVisible() {
  if (document.visibilityState === 'visible') void loadDashboard()
}

function refreshIfRestored(event: PageTransitionEvent) {
  if (event.persisted) void loadDashboard()
}

onMounted(() => {
  void loadDashboard()
  document.addEventListener('visibilitychange', refreshIfVisible)
  window.addEventListener('pageshow', refreshIfRestored)
})

onActivated(() => {
  void loadDashboard()
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshIfVisible)
  window.removeEventListener('pageshow', refreshIfRestored)
})

function go() {
  navigateTo({ path: '/search', query: { q: q.value } })
}
</script>
