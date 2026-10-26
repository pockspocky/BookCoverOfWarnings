<template>
  <div>
    <PageHeader title="Students" kicker="Directory" description="Filter published student records. Private self-description fields are never listed here.">
      <button v-if="auth.isAdmin" class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="showCreate = !showCreate">Add student</button>
    </PageHeader>
    <form v-if="auth.isAdmin && showCreate" class="mb-6 grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askCreate">
      <h2 class="font-semibold md:col-span-2">Publish a student</h2>
      <label class="text-sm">Display name
        <input v-model="createForm.displayName" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
      </label>
      <label class="text-sm">Graduation year
        <input v-model.number="createForm.graduationYear" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="number" min="1900" max="2200" required />
      </label>
      <label class="text-sm md:col-span-2">Public notes
        <textarea v-model="createForm.generalComment" class="mt-1 h-20 w-full border border-panel-border bg-ink-950 p-2" />
      </label>
      <p v-if="createError" class="text-sm text-red-300 md:col-span-2">{{ createError }}</p>
      <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Publish student</button>
    </form>
    <form class="mb-4 grid gap-3 md:grid-cols-4" @submit.prevent="load">
      <input v-model="q" class="border border-panel-border bg-panel px-3 py-2 text-sm" placeholder="Display name or ID" />
      <input v-model.number="year" class="border border-panel-border bg-panel px-3 py-2 text-sm" type="number" placeholder="Graduation year" />
      <select v-model="categoryId" class="border border-panel-border bg-panel px-3 py-2 text-sm">
        <option value="">All trait categories</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
      </select>
      <select v-model="groupId" class="border border-panel-border bg-panel px-3 py-2 text-sm">
        <option value="">All groups</option>
        <option v-for="group in groups" :key="group.id" :value="group.id">{{ group.name }}</option>
      </select>
      <select v-model="sort" class="border border-panel-border bg-panel px-3 py-2 text-sm">
        <option value="name">Sort by name</option>
        <option value="graduationYear">Sort by graduation year</option>
      </select>
      <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Apply</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="!rows.length" title="No students" description="No authorized records match these filters." />
    <DataTable v-else :columns="['Name', 'Year', 'Traits', 'Groups', 'ID']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border hover:bg-ink-900">
        <td class="px-3 py-2"><NuxtLink :to="`/students/${row.id}`" class="text-accent">{{ row.displayName }}</NuxtLink></td>
        <td class="px-3 py-2 font-mono text-xs">{{ row.graduationYear }}</td>
        <td class="px-3 py-2">{{ row.traitCount }}</td>
        <td class="px-3 py-2">{{ row.groupCount }}</td>
        <td class="px-3 py-2 font-mono text-[11px] text-ink-400">{{ row.id }}</td>
      </tr>
    </DataTable>
    <PaginationBar v-if="meta" :meta="meta" @page="onPage" />
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmCreate" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const q = ref('')
const year = ref<number | undefined>()
const categoryId = ref('')
const groupId = ref('')
const sort = ref<'name' | 'graduationYear'>('name')
const page = ref(1)
const pending = ref(true)
const rows = ref<Awaited<ReturnType<typeof $api.students.list>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.students.list>>['meta'] | null>(null)
const categories = ref<Awaited<ReturnType<typeof $api.traits.categories>>>([])
const groups = ref<Awaited<ReturnType<typeof $api.groups.list>>['data']>([])
const showCreate = ref(false)
const createBaseline = { displayName: '', graduationYear: new Date().getFullYear(), generalComment: '' }
const createForm = reactive({ ...createBaseline })
const createError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Publish' })
const saving = ref(false)
const createDirty = computed(() => createForm.displayName !== createBaseline.displayName || createForm.generalComment !== createBaseline.generalComment || createForm.graduationYear !== createBaseline.graduationYear)
useUnsavedGuard(createDirty)

async function load() {
  pending.value = true
  const result = await $api.students.list({
    q: q.value || undefined,
    graduationYear: year.value || undefined,
    categoryId: categoryId.value || undefined,
    groupId: groupId.value || undefined,
    sort: sort.value,
    page: page.value,
    pageSize: 10
  })
  rows.value = result.data
  meta.value = result.meta
  pending.value = false
}

function onPage(next: number) {
  page.value = next
  load()
}

function askCreate() {
  createError.value = ''
  if (!Number.isInteger(createForm.graduationYear)) {
    createError.value = 'graduationYear: Graduation year is invalid.'
    return
  }
  dialog.title = 'Publish this student?'
  dialog.message = 'This writes a published student immediately. It does not enter the review queue.'
  dialog.confirmLabel = 'Publish'
  dialog.open = true
}

async function confirmCreate() {
  dialog.open = false
  if (saving.value) return
  saving.value = true
  createError.value = ''
  try {
    await $api.admin.createStudent({
      displayName: createForm.displayName,
      graduationYear: createForm.graduationYear,
      generalComment: createForm.generalComment
    })
    createForm.displayName = createBaseline.displayName
    createForm.graduationYear = createBaseline.graduationYear
    createForm.generalComment = createBaseline.generalComment
    showCreate.value = false
    toasts.push('Student published.', 'success')
    await load()
  } catch (err) {
    createError.value = errorMessage(err)
    toasts.push(createError.value, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  categories.value = await $api.traits.categories()
  groups.value = (await $api.groups.list({ pageSize: 50 })).data
  await load()
})
</script>
