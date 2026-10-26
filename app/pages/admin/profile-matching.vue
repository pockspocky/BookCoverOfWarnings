<template>
  <div>
    <PageHeader title="Profile matching" kicker="Admin" description="Matches use an explicit student record selected by an administrator. Similar display names are not treated as the same person. Saving invalidates that account's existing sessions." />
    <SkeletonBlock v-if="pending" />
    <div v-else class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <DataTable :columns="['Email', 'Role', 'Match', 'Status']">
        <tr v-for="account in accounts" :key="account.id" class="cursor-pointer border-b border-panel-border hover:bg-ink-900" @click="select(account)">
          <td class="px-3 py-2">{{ account.email }}</td>
          <td class="px-3 py-2">{{ account.role }}</td>
          <td class="px-3 py-2 font-mono text-[11px]">{{ account.matchedStudentId || 'none' }}</td>
          <td class="px-3 py-2">{{ account.matchStatus }}</td>
        </tr>
      </DataTable>
      <form v-if="selected" class="border border-panel-border bg-panel p-4" @submit.prevent="save">
        <h2 class="mb-2 font-semibold">{{ selected.email }}</h2>
        <label class="mb-2 block text-sm">Matched student
          <select v-model="draft.matchedStudentId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1">
            <option value="">None</option>
            <option v-for="student in students" :key="student.id" :value="student.id">{{ student.displayName }} · {{ student.graduationYear }}</option>
          </select>
        </label>
        <label class="mb-2 block text-sm">Match status
          <select v-model="draft.matchStatus" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1">
            <option value="pending">pending</option>
            <option value="verified">verified</option>
            <option value="disputed">disputed</option>
            <option value="corrected">corrected</option>
          </select>
        </label>
        <label class="mb-3 block text-sm">Reason
          <textarea v-model="draft.reason" class="mt-1 h-24 w-full border border-panel-border bg-ink-950 p-2" minlength="8" required />
        </label>
        <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Correct match</button>
      </form>
      <EmptyState v-else title="Select an account" description="Choose an account to correct its trusted student mapping." />
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { MatchStatus, UserAccount } from '../../../lib/types'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const pending = ref(true)
const accounts = ref<UserAccount[]>([])
const students = ref<Awaited<ReturnType<typeof $api.students.list>>['data']>([])
const selected = ref<UserAccount | null>(null)
const draft = reactive<{ matchedStudentId: string; matchStatus: MatchStatus; reason: string }>({
  matchedStudentId: '',
  matchStatus: 'corrected',
  reason: ''
})
const dirty = computed(() => Boolean(draft.reason))
useUnsavedGuard(dirty)

function select(account: UserAccount) {
  selected.value = account
  draft.matchedStudentId = account.matchedStudentId ?? ''
  draft.matchStatus = account.matchStatus
  draft.reason = ''
}

async function load() {
  const [accountPage, studentPage] = await Promise.all([
    $api.admin.accounts(),
    $api.students.list({ pageSize: 50 })
  ])
  accounts.value = accountPage.data
  students.value = studentPage.data
  pending.value = false
}

async function save() {
  if (!selected.value) return
  try {
    await $api.admin.correctProfileMatch(selected.value.id, {
      matchedStudentId: draft.matchedStudentId || null,
      matchStatus: draft.matchStatus,
      reason: draft.reason
    })
    toasts.push('Match corrected. Previous sessions for that account were invalidated.', 'success')
    if (selected.value.id === auth.user?.account.id) await auth.refreshAfterMatchChange()
    draft.reason = ''
    await load()
    const next = accounts.value.find((account) => account.id === selected.value?.id)
    if (next) select(next)
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

onMounted(load)
</script>
