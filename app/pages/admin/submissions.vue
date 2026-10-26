<template>
  <div>
    <PageHeader title="Submission queue" kicker="Admin" description="Consent must already be valid. Approval does not replace it. Rejection removes the proposal instead of archiving its content." />
    <form class="mb-4 flex gap-2" @submit.prevent="load">
      <label class="text-sm">Status
        <select v-model="status" class="ml-2 border border-panel-border bg-panel px-2 py-1">
          <option value="">Pending and awaiting consent</option>
          <option value="pending">pending</option>
          <option value="awaiting_consent">awaiting consent</option>
        </select>
      </label>
      <button class="border border-accent px-3 py-1 text-sm text-accent" type="submit">Filter</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="!rows.length" title="Queue empty" description="No submissions are waiting in this filter." />
    <div v-else class="space-y-3">
      <article v-for="row in rows" :key="row.id" class="border border-panel-border bg-panel p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="font-medium">{{ row.entityType }} · {{ row.operation }}</p>
            <p class="mono-meta">{{ row.submittedAt }} · {{ row.submitterEmail }} · {{ row.id }}</p>
          </div>
          <StatusBadge :label="row.status" :tone="row.status === 'awaiting_consent' ? 'warn' : 'neutral'" />
        </div>
        <dl class="mt-3 grid gap-1 text-sm">
          <div v-for="[key, value] in visibleData(row.proposedData)" :key="key" class="grid grid-cols-[10rem_1fr] gap-2">
            <dt class="mono-meta">{{ key }}</dt>
            <dd class="break-words">{{ formatValue(value) }}</dd>
          </div>
        </dl>
        <ul class="mt-3 space-y-1 text-xs">
          <li v-for="requirement in row.consentRequirements" :key="requirement.subjectStudentId + requirement.scope">
            Subject consent {{ requirement.satisfied ? 'recorded' : 'missing' }} · {{ requirement.scope }}
          </li>
          <li v-if="!row.consentRequirements.length">No subject-consent requirement on this proposal.</li>
        </ul>
        <div class="mt-3 flex gap-2">
          <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" :aria-label="`Approve ${row.entityType} submission`" @click="ask('approve', row.id)">Approve</button>
          <button class="border border-panel-border px-3 py-1.5 text-sm" type="button" :aria-label="`Reject ${row.entityType} submission`" @click="ask('reject', row.id)">Reject</button>
        </div>
      </article>
    </div>
    <PaginationBar v-if="meta" :meta="meta" @page="(n) => { page = n; load() }" />
    <ConfirmDialog :open="dialog.open" :title="dialog.action === 'reject' ? 'Delete this submission?' : 'Publish this submission?'" :message="dialog.action === 'reject' ? 'Rejection deletes the submitted content. It is not kept in a rejection archive.' : 'Publishing writes a new authorized record. This cannot bypass missing consent.'" :confirm-label="dialog.action === 'reject' ? 'Delete submission' : 'Publish'" @cancel="dialog.open = false" @confirm="confirm" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const toasts = useToastStore()
const status = ref('')
const page = ref(1)
const pending = ref(true)
const rows = ref<Awaited<ReturnType<typeof $api.admin.submissions>>['data']>([])
const meta = ref<Awaited<ReturnType<typeof $api.admin.submissions>>['meta'] | null>(null)
const dialog = reactive<{ open: boolean; action: 'approve' | 'reject'; id: string }>({ open: false, action: 'approve', id: '' })

function visibleData(data: Record<string, unknown>) {
  return Object.entries(data).filter(([key]) => !/sexual/i.test(key) && key !== 'batchId')
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

async function load() {
  pending.value = true
  const result = await $api.admin.submissions({ status: status.value || undefined, page: page.value, pageSize: 10 })
  rows.value = result.data
  meta.value = result.meta
  pending.value = false
}

function ask(action: 'approve' | 'reject', id: string) {
  dialog.action = action
  dialog.id = id
  dialog.open = true
}

async function confirm() {
  dialog.open = false
  try {
    if (dialog.action === 'approve') {
      const result = await $api.admin.approve(dialog.id)
      toasts.push(`Published ${result.data.publishedIds.length} record(s).`, 'success')
    } else {
      await $api.admin.reject(dialog.id, 'Rejected during review. Content deleted.')
      toasts.push('Submission deleted. Content was not archived.', 'success')
    }
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

onMounted(load)
</script>
