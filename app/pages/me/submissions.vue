<template>
  <div>
    <PageHeader title="My submissions" kicker="Queue" description="Ordinary members cannot publish directly. Identity on other people's submissions is hidden from you." />
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Could not load submissions" :description="error" />
    <EmptyState v-else-if="!rows.length" title="No submissions" description="Proposals you send for review will appear here until they are approved or deleted." />
    <DataTable v-else :columns="['Type', 'Operation', 'Status', 'Submitted', 'Consent']">
      <tr v-for="row in rows" :key="row.id" class="border-b border-panel-border align-top">
        <td class="px-3 py-2">{{ row.entityType }}</td>
        <td class="px-3 py-2">{{ row.operation }}</td>
        <td class="px-3 py-2"><StatusBadge :label="row.status" :tone="row.status === 'approved' ? 'good' : row.status === 'rejected' ? 'bad' : 'warn'" /></td>
        <td class="px-3 py-2 font-mono text-xs">{{ row.submittedAt }}</td>
        <td class="px-3 py-2 text-xs">
          <p v-for="requirement in row.consentRequirements" :key="requirement.scope + requirement.subjectStudentId">
            {{ requirement.satisfied ? 'Consent recorded' : 'Waiting for subject consent' }}
          </p>
          <button v-if="canConsent(row)" class="mt-1 border border-accent px-2 py-1 text-accent" type="button" @click="consent(row.id)">Grant my consent</button>
        </td>
      </tr>
    </DataTable>
    <PaginationBar v-if="meta" :meta="meta" @page="(n) => { page = n; load() }" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { SubmissionPublic } from '../../../lib/types'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const pending = ref(true)
const error = ref('')
const page = ref(1)
const rows = ref<SubmissionPublic[]>([])
const meta = ref<Awaited<ReturnType<typeof $api.submissions.mine>>['meta'] | null>(null)

function canConsent(row: SubmissionPublic) {
  return row.status === 'awaiting_consent' && row.consentRequirements.some((item) => item.subjectStudentId === auth.matchedStudentId && !item.satisfied)
}

async function load() {
  pending.value = true
  error.value = ''
  try {
    const result = await $api.submissions.mine({ page: page.value, pageSize: 20 })
    rows.value = result.data
    meta.value = result.meta
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

async function consent(id: string) {
  try {
    await $api.submissions.grantConsent(id)
    toasts.push('Consent recorded. An administrator still has to approve publication.', 'success')
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

onMounted(load)
</script>
