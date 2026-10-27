<template>
  <div>
    <PageHeader title="Relationships" kicker="Directory" description="Directional records. A→B does not imply B→A.">
      <NuxtLink v-if="auth.isAdmin" to="/relationships/new" class="bg-accent px-3 py-1.5 text-sm text-accent-fg">Create relationship</NuxtLink>
    </PageHeader>
    <form class="mb-4 grid gap-3 md:grid-cols-4" @submit.prevent="load">
      <input v-model="q" class="border border-panel-border bg-panel px-3 py-2 text-sm" placeholder="Endpoint name" aria-label="Endpoint name" />
      <select v-model="relationshipTypeId" class="border border-panel-border bg-panel px-3 py-2 text-sm" aria-label="Relationship type">
        <option value="">All types</option>
        <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
      </select>
      <select v-model="status" class="border border-panel-border bg-panel px-3 py-2 text-sm" aria-label="Status">
        <option value="">Current and ended</option>
        <option value="active">Active</option>
        <option value="ended">Ended</option>
        <option value="archived">Archived</option>
      </select>
      <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Filter</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Could not load relationships" :description="error" />
    <EmptyState v-else-if="!rows.length" title="No relationships" description="No approved directional records match." />
    <DataTable v-else :columns="['From', 'To', 'Type', 'Status', 'Dates']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border">
        <td class="px-3 py-2"><NuxtLink :to="endpointHref(row.sourceType, row.sourceId)" class="text-accent">{{ row.sourceLabel }}</NuxtLink></td>
        <td class="px-3 py-2"><NuxtLink :to="endpointHref(row.targetType, row.targetId)">{{ row.targetLabel }}</NuxtLink></td>
        <td class="px-3 py-2"><NuxtLink :to="`/relationships/${row.id}`" class="text-accent">{{ row.relationshipType.name }}</NuxtLink></td>
        <td class="px-3 py-2"><StatusBadge :label="row.status" :tone="row.status === 'active' ? 'good' : 'muted'" /></td>
        <td class="px-3 py-2 font-mono text-xs">{{ row.startDate || '—' }} → {{ row.endDate || 'open' }}</td>
      </tr>
    </DataTable>
    <PaginationBar v-if="meta" :meta="meta" @page="(n) => { page = n; load() }" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const q = ref('')
const relationshipTypeId = ref('')
const status = ref('')
const page = ref(1)
const pending = ref(true)
const error = ref('')
const rows = ref<Awaited<ReturnType<typeof $api.relationships.list>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.relationships.list>>['meta'] | null>(null)
const types = ref<Awaited<ReturnType<typeof $api.relationships.types>>>([])

function endpointHref(type: string, id: string) {
  return type === 'student' ? `/students/${id}` : `/groups/${id}`
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const result = await $api.relationships.list({
      q: q.value || undefined,
      relationshipTypeId: relationshipTypeId.value || undefined,
      status: status.value || undefined,
      includeArchived: status.value === 'archived',
      page: page.value,
      pageSize: 12
    })
    rows.value = result.data
    meta.value = result.meta
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

onMounted(async () => {
  types.value = await $api.relationships.types()
  await load()
})
</script>
