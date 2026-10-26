<template>
  <div>
    <PageHeader title="Groups" kicker="Directory" description="Administrator-created groups. Membership proposals require approval.">
      <button v-if="auth.isAdmin" class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="showCreate = !showCreate">Add group</button>
    </PageHeader>
    <form v-if="auth.isAdmin && showCreate" class="mb-6 grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askCreate">
      <label class="text-sm">Name
        <input v-model="name" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
      </label>
      <label class="text-sm md:col-span-2">Description
        <textarea v-model="description" class="mt-1 h-20 w-full border border-panel-border bg-ink-950 p-2" required />
      </label>
      <p v-if="createError" class="text-sm text-red-300 md:col-span-2">{{ createError }}</p>
      <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Create group</button>
    </form>
    <form class="mb-4 flex flex-wrap gap-3" @submit.prevent="load">
      <label class="text-sm">Name
        <input v-model="q" class="ml-2 border border-panel-border bg-panel px-3 py-2 text-sm" placeholder="Group name" />
      </label>
      <label class="flex items-center gap-2 text-sm"><input v-model="includeArchived" type="checkbox" /> Include archived</label>
      <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Search</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Could not load groups" :description="error" />
    <EmptyState v-else-if="!rows.length" title="No groups" description="No authorized groups match these filters." />
    <DataTable v-else :columns="['Name', 'Status', 'Version', 'ID']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border">
        <td class="px-3 py-2"><NuxtLink :to="`/groups/${row.id}`" class="text-accent">{{ row.name }}</NuxtLink></td>
        <td class="px-3 py-2"><StatusBadge :label="row.status" /></td>
        <td class="px-3 py-2 font-mono text-xs">v{{ row.currentVersion }}</td>
        <td class="px-3 py-2 font-mono text-[11px] text-ink-400">{{ row.id }}</td>
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
const includeArchived = ref(false)
const page = ref(1)
const pending = ref(true)
const error = ref('')
const rows = ref<Awaited<ReturnType<typeof $api.groups.list>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.groups.list>>['meta'] | null>(null)
const showCreate = ref(false)
const name = ref('')
const description = ref('')
const createError = ref('')
const dialog = reactive({ open: false, title: 'Create this group?', message: 'This publishes the group immediately.', confirmLabel: 'Create group' })
const saving = ref(false)
useUnsavedGuard(computed(() => Boolean(name.value || description.value)))

async function load() {
  pending.value = true
  error.value = ''
  try {
    const result = await $api.groups.list({ q: q.value || undefined, includeArchived: includeArchived.value, page: page.value, pageSize: 12 })
    rows.value = result.data
    meta.value = result.meta
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
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
    await $api.admin.createGroup({ name: name.value, description: description.value })
    name.value = ''
    description.value = ''
    showCreate.value = false
    toasts.push('Group created.', 'success')
    await load()
  } catch (err) {
    createError.value = errorMessage(err)
    toasts.push(createError.value, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
