<template>
  <div>
    <PageHeader title="Traits" kicker="Directory">
      <button v-if="auth.isAdmin" class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="showCreate = !showCreate">Add trait</button>
    </PageHeader>
    <p v-if="auth.isAdmin && showCreate && !pending && !activeCategories.length" class="mb-4 border border-panel-border bg-panel p-4 text-sm">
      Create a category on <NuxtLink class="text-accent" to="/admin/categories">Categories</NuxtLink> before adding a trait.
    </p>
    <form v-else-if="auth.isAdmin && showCreate" class="mb-6 grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askCreate">
      <h2 class="font-semibold md:col-span-2">Publish a trait</h2>
      <label class="text-sm">Student
        <select v-model="createForm.studentId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
          <option value="">Select</option>
          <option v-for="student in students" :key="student.id" :value="student.id">{{ student.displayName }}</option>
        </select>
      </label>
      <label class="text-sm">Category
        <select v-model="createForm.categoryId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
          <option value="">Select</option>
          <option v-for="category in activeCategories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </label>
      <label class="text-sm md:col-span-2">Title
        <input v-model="createForm.title" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
      </label>
      <label class="text-sm md:col-span-2">Description
        <textarea v-model="createForm.description" class="mt-1 h-20 w-full border border-panel-border bg-ink-950 p-2" />
      </label>
      <p v-if="createError" class="text-sm text-red-300 md:col-span-2">{{ createError }}</p>
      <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Publish trait</button>
    </form>
    <form class="mb-4 flex flex-wrap gap-3" @submit.prevent="load">
      <input v-model="q" class="border border-panel-border bg-panel px-3 py-2 text-sm" placeholder="Keyword" />
      <select v-model="categoryId" class="border border-panel-border bg-panel px-3 py-2 text-sm">
        <option value="">All categories</option>
        <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
      </select>
      <label class="flex items-center gap-2 text-sm"><input v-model="includeArchived" type="checkbox" /> Include archived</label>
      <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Search</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="!rows.length" title="No traits" description="No published traits match." />
    <DataTable v-else :columns="['Title', 'Student', 'Category', 'Status']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border">
        <td class="px-3 py-2"><NuxtLink :to="`/traits/${row.id}`" class="text-accent">{{ row.title }}</NuxtLink></td>
        <td class="px-3 py-2"><NuxtLink :to="`/students/${row.student.id}`">{{ row.student.displayName }}</NuxtLink></td>
        <td class="px-3 py-2">{{ row.category.name }}</td>
        <td class="px-3 py-2"><StatusBadge :label="row.status" /></td>
      </tr>
    </DataTable>
    <PaginationBar v-if="meta" :meta="meta" @page="(n) => { page = n; load() }" />
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmCreate" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const q = ref('')
const categoryId = ref('')
const includeArchived = ref(false)
const page = ref(1)
const pending = ref(true)
const rows = ref<Awaited<ReturnType<typeof $api.traits.list>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.traits.list>>['meta'] | null>(null)
const categories = ref<Awaited<ReturnType<typeof $api.traits.categories>>>([])
const activeCategories = computed(() => categories.value.filter((category) => category.isActive))
const students = ref<Awaited<ReturnType<typeof $api.students.list>>['data']>([])
const showCreate = ref(false)
const createForm = reactive({ studentId: '', categoryId: '', title: '', description: '' })
const createError = ref('')
const dialog = reactive({ open: false, title: 'Publish this trait?', message: 'This writes a published trait immediately. It does not enter the review queue.', confirmLabel: 'Publish' })
const saving = ref(false)
useUnsavedGuard(computed(() => Boolean(createForm.studentId || createForm.categoryId || createForm.title || createForm.description)))

async function load() {
  pending.value = true
  const result = await $api.traits.list({ q: q.value || undefined, categoryId: categoryId.value || undefined, includeArchived: includeArchived.value, page: page.value, pageSize: 12 })
  rows.value = result.data
  meta.value = result.meta
  pending.value = false
}

function askCreate() {
  createError.value = ''
  dialog.open = true
}

async function confirmCreate() {
  dialog.open = false
  if (saving.value) return
  saving.value = true
  createError.value = ''
  try {
    await $api.admin.createTrait({
      studentId: createForm.studentId,
      categoryId: createForm.categoryId,
      title: createForm.title,
      description: createForm.description.trim() ? createForm.description : null
    })
    createForm.studentId = ''
    createForm.categoryId = ''
    createForm.title = ''
    createForm.description = ''
    showCreate.value = false
    toasts.push('Trait published.', 'success')
    await load()
  } catch (err) {
    createError.value = errorMessage(err)
    toasts.push(createError.value, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const [categoryRows, studentPage] = await Promise.all([
    $api.traits.categories(),
    auth.isAdmin ? $api.students.list({ pageSize: 50 }) : Promise.resolve({ data: [] })
  ])
  categories.value = categoryRows
  students.value = studentPage.data
  await load()
})
</script>
