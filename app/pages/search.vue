<template>
  <div>
    <PageHeader title="Advanced search" kicker="Cross-reference" description="Searches permitted published records only. Pending submissions, rejected content, and private self-description fields are excluded." />
    <div class="mb-4 flex flex-wrap gap-2">
      <button v-for="preset in presets" :key="preset.label" class="border border-panel-border px-2 py-1 text-xs" type="button" @click="applyPreset(preset)">{{ preset.label }}</button>
    </div>
    <form class="mb-4 grid gap-3 md:grid-cols-3" @submit.prevent="run(1)">
      <label class="text-sm md:col-span-3">Keywords
        <input v-model="form.q" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" />
      </label>
      <label class="text-sm">Graduation year
        <input v-model="form.graduationYear" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" type="number" />
      </label>
      <label class="text-sm">Trait title
        <input v-model="form.traitTitle" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" />
      </label>
      <label class="text-sm">Trait category
        <select v-model="form.traitCategoryId" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Any</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </label>
      <label class="text-sm">Group
        <select v-model="form.groupId" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Any</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
        </select>
      </label>
      <label class="text-sm">Relationship type
        <select v-model="form.relationshipTypeId" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Any</option>
          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
      </label>
      <label class="text-sm">Connected to
        <select v-model="form.connectedTo" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Anyone</option>
          <option v-for="student in students" :key="student.id" :value="`student:${student.id}`">Student · {{ student.displayName }}</option>
          <option v-for="group in groups" :key="`g-${group.id}`" :value="`group:${group.id}`">Group · {{ group.name }}</option>
        </select>
      </label>
      <label class="text-sm">Verification
        <select v-model="form.verificationStatus" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Any</option>
          <option value="pending">pending</option>
          <option value="verified">verified</option>
          <option value="insufficient">insufficient</option>
          <option value="disputed">disputed</option>
        </select>
      </label>
      <label class="text-sm">Minimum reliability
        <input v-model="form.minReliability" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" type="number" min="1" max="5" />
      </label>
      <label class="text-sm">From date
        <input v-model="form.fromDate" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" type="date" />
      </label>
      <label class="text-sm">To date
        <input v-model="form.toDate" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" type="date" />
      </label>
      <label class="text-sm">Record state
        <select v-model="form.status" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Current</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <fieldset class="md:col-span-3">
        <legend class="mb-1 text-sm">Entity types</legend>
        <label v-for="type in entityTypeOptions" :key="type" class="mr-3 text-sm">
          <input v-model="form.entityTypes" type="checkbox" :value="type" /> {{ type }}
        </label>
      </fieldset>
      <button class="w-fit border border-accent px-3 py-2 text-sm text-accent" type="submit">Search</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Search failed" :description="error" />
    <EmptyState v-else-if="!rows.length" title="No results" description="No authorized records match. Pending and private fields are not searchable." />
    <DataTable v-else :columns="['Type', 'Title', 'Context']">
      <tr v-for="row in rows" :key="`${row.entityType}-${row.id}`" class="border-b border-panel-border">
        <td class="px-3 py-2 font-mono text-xs">{{ row.entityType }}</td>
        <td class="px-3 py-2"><NuxtLink :to="row.href" class="text-accent">{{ row.title }}</NuxtLink></td>
        <td class="px-3 py-2 text-ink-300">{{ row.subtitle }}</td>
      </tr>
    </DataTable>
    <PaginationBar v-if="meta" :meta="meta" @page="run" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../utils/errors'
import type { EntityType, SearchFilters, VerificationStatus } from '../../lib/types'

const route = useRoute()
const { $api } = useNuxtApp()
const categories = ref<Awaited<ReturnType<typeof $api.traits.categories>>>([])
const groups = ref<Awaited<ReturnType<typeof $api.groups.list>>['data']>([])
const students = ref<Awaited<ReturnType<typeof $api.students.list>>['data']>([])
const types = ref<Awaited<ReturnType<typeof $api.relationships.types>>>([])
const entityTypeOptions: EntityType[] = ['student', 'trait', 'group', 'relationship', 'evidence']
const form = reactive({
  q: typeof route.query.q === 'string' ? route.query.q : '',
  graduationYear: '',
  traitTitle: '',
  traitCategoryId: '',
  groupId: '',
  relationshipTypeId: '',
  connectedTo: '',
  verificationStatus: '' as '' | VerificationStatus,
  minReliability: '',
  fromDate: '',
  toDate: '',
  status: '',
  entityTypes: [] as EntityType[]
})
const pending = ref(true)
const error = ref('')
const rows = ref<Awaited<ReturnType<typeof $api.search.query>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.search.query>>['meta'] | null>(null)

interface SearchPreset {
  label: string
  patch: {
    entityTypes?: EntityType[]
    minReliability?: string
    traitCategoryName?: string
    useFirstGroup?: boolean
    useFirstStudent?: boolean
  }
}

const presets: SearchPreset[] = [
  { label: 'Students in a group with an organization trait', patch: { entityTypes: ['student'], traitCategoryName: 'Organization role' } },
  { label: 'Traits with reliability ≥ 4', patch: { entityTypes: ['trait'], minReliability: '4' } },
  { label: 'Relationships involving the first group', patch: { entityTypes: ['relationship'], useFirstGroup: true } },
  { label: 'Records connected to the first student', patch: { useFirstStudent: true } }
]

function applyPreset(preset: SearchPreset) {
  form.entityTypes = preset.patch.entityTypes ? [...preset.patch.entityTypes] : []
  form.minReliability = preset.patch.minReliability ?? ''
  if (preset.patch.traitCategoryName) {
    form.traitCategoryId = categories.value.find((item) => item.name === preset.patch.traitCategoryName)?.id ?? ''
  }
  if (preset.patch.useFirstGroup && groups.value[0]) {
    form.connectedTo = `group:${groups.value[0].id}`
    form.groupId = groups.value[0].id
  }
  if (preset.patch.useFirstStudent && students.value[0]) form.connectedTo = `student:${students.value[0].id}`
  run(1)
}

async function run(page = 1) {
  pending.value = true
  error.value = ''
  const [connectedType, connectedId] = form.connectedTo.split(':')
  const filters: SearchFilters = {
    q: form.q || undefined,
    graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
    traitTitle: form.traitTitle || undefined,
    traitCategoryId: form.traitCategoryId || undefined,
    groupId: form.groupId || undefined,
    relationshipTypeId: form.relationshipTypeId || undefined,
    connectedToType: connectedType === 'student' || connectedType === 'group' ? connectedType : undefined,
    connectedToId: connectedId || undefined,
    verificationStatus: form.verificationStatus || undefined,
    minReliability: form.minReliability ? Number(form.minReliability) : undefined,
    fromDate: form.fromDate || undefined,
    toDate: form.toDate || undefined,
    status: form.status === 'archived' ? 'archived' : undefined,
    entityTypes: form.entityTypes.length ? form.entityTypes : undefined,
    page,
    pageSize: 15
  }
  try {
    const result = await $api.search.query(filters)
    rows.value = result.data
    meta.value = result.meta
  } catch (err) {
    error.value = errorMessage(err)
    rows.value = []
  } finally {
    pending.value = false
  }
}

onMounted(async () => {
  const [categoryRows, groupPage, studentPage, relationshipTypes] = await Promise.all([
    $api.traits.categories(),
    $api.groups.list({ pageSize: 50 }),
    $api.students.list({ pageSize: 50 }),
    $api.relationships.types()
  ])
  categories.value = categoryRows
  groups.value = groupPage.data
  students.value = studentPage.data
  types.value = relationshipTypes
  await run(1)
})
</script>
