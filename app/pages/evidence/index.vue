<template>
  <div>
    <PageHeader title="Evidence" kicker="Directory">
      <button v-if="auth.isAdmin" class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="showCreate = !showCreate">Add evidence</button>
    </PageHeader>
    <form v-if="auth.isAdmin && showCreate" class="mb-6 grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askCreate">
      <h2 class="font-semibold md:col-span-2">Publish evidence</h2>
      <label class="text-sm md:col-span-2">Summary
        <textarea v-model="createForm.summary" class="mt-1 h-20 w-full border border-panel-border bg-ink-950 p-2" required />
      </label>
      <label class="text-sm">Date
        <input v-model="createForm.evidenceDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" required />
      </label>
      <label class="text-sm">HTTPS link
        <input v-model="createForm.url" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="url" placeholder="https://" />
      </label>
      <p v-if="createError" class="text-sm text-red-300 md:col-span-2">{{ createError }}</p>
      <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Publish evidence</button>
    </form>
    <form class="mb-4 flex flex-wrap gap-3" @submit.prevent="load">
      <input v-model="q" class="border border-panel-border bg-panel px-3 py-2 text-sm" placeholder="Summary" />
      <select v-model="verificationStatus" class="border border-panel-border bg-panel px-3 py-2 text-sm">
        <option value="">Any verification</option>
        <option value="pending">pending</option>
        <option value="verified">verified</option>
        <option value="insufficient">insufficient</option>
        <option value="disputed">disputed</option>
      </select>
      <input v-model.number="minReliability" class="w-40 border border-panel-border bg-panel px-3 py-2 text-sm" type="number" min="1" max="5" placeholder="Min reliability" />
      <label class="flex items-center gap-2 text-sm"><input v-model="includeArchived" type="checkbox" /> Archived</label>
      <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Filter</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="!rows.length" title="No evidence" description="No authorized evidence records match." />
    <DataTable v-else :columns="['Summary', 'Date', 'Verification', 'Reliability', 'Status']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border">
        <td class="px-3 py-2"><NuxtLink :to="`/evidence/${row.id}`" class="text-accent">{{ row.summary }}</NuxtLink></td>
        <td class="px-3 py-2 font-mono text-xs">{{ row.evidenceDate }}</td>
        <td class="px-3 py-2"><StatusBadge :label="row.verificationStatus" :tone="row.verificationStatus === 'verified' ? 'good' : 'warn'" /></td>
        <td class="px-3 py-2">{{ row.reliabilityScore ?? '—' }}</td>
        <td class="px-3 py-2">{{ row.status }}</td>
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
const verificationStatus = ref('')
const minReliability = ref<number | undefined>()
const includeArchived = ref(false)
const page = ref(1)
const pending = ref(true)
const rows = ref<Awaited<ReturnType<typeof $api.evidence.list>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.evidence.list>>['meta'] | null>(null)
const showCreate = ref(false)
const createForm = reactive({ summary: '', evidenceDate: '', url: '' })
const createError = ref('')
const dialog = reactive({ open: false, title: 'Publish this evidence?', message: 'This writes a published evidence record immediately. It does not enter the review queue.', confirmLabel: 'Publish' })
const saving = ref(false)
useUnsavedGuard(computed(() => Boolean(createForm.summary || createForm.evidenceDate || createForm.url)))

function httpsUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (!trimmed.startsWith('https://')) return null
  return [trimmed]
}

async function load() {
  pending.value = true
  const result = await $api.evidence.list({
    q: q.value || undefined,
    verificationStatus: verificationStatus.value || undefined,
    minReliability: minReliability.value,
    includeArchived: includeArchived.value,
    page: page.value
  })
  rows.value = result.data
  meta.value = result.meta
  pending.value = false
}
function askCreate() {
  createError.value = ''
  if (createForm.url.trim() && httpsUrl(createForm.url) == null) {
    createError.value = 'urls: Only HTTPS URLs are permitted.'
    return
  }
  dialog.open = true
}

async function confirmCreate() {
  dialog.open = false
  if (saving.value) return
  saving.value = true
  const urls = httpsUrl(createForm.url)
  if (urls == null) {
    createError.value = 'urls: Only HTTPS URLs are permitted.'
    saving.value = false
    return
  }
  createError.value = ''
  try {
    await $api.admin.createEvidence({
      summary: createForm.summary,
      evidenceDate: createForm.evidenceDate,
      urls
    })
    createForm.summary = ''
    createForm.evidenceDate = ''
    createForm.url = ''
    showCreate.value = false
    toasts.push('Evidence published.', 'success')
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
