<template>
  <div>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Relationship unavailable" :description="error" />
    <div v-else-if="record">
      <PageHeader :title="`${record.sourceLabel} → ${record.targetLabel}`" kicker="Directional relationship">
        <StatusBadge :label="record.status" :tone="record.status === 'active' ? 'good' : 'muted'" />
        <NuxtLink :to="`/graph?focus=${record.sourceType}:${record.sourceId}`" class="border border-panel-border px-3 py-1.5 text-sm">Graph</NuxtLink>
        <button v-if="auth.isAdmin" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showEdit = !showEdit">Edit</button>
        <button v-if="auth.isAdmin && record.status !== 'archived'" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="askArchive">Archive</button>
      </PageHeader>
      <form v-if="auth.isAdmin && showEdit" class="mb-6 grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askSave">
        <h2 class="font-semibold md:col-span-2">Edit this direction</h2>
        <label class="text-sm md:col-span-2">Comment
          <textarea v-model="draft.generalComment" class="mt-1 h-24 w-full border border-panel-border bg-ink-950 p-2" />
        </label>
        <label class="text-sm">Start date
          <input v-model="draft.startDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" />
        </label>
        <label class="text-sm">End date
          <input v-model="draft.endDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" />
        </label>
        <label class="text-sm">Status
          <select v-model="draft.status" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1">
            <option value="active">active</option>
            <option value="ended">ended</option>
            <option value="archived">archived</option>
          </select>
        </label>
        <p v-if="editError" class="text-sm text-red-300 md:col-span-2">{{ editError }}</p>
        <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Save version</button>
      </form>
      <p class="mb-4 text-sm">{{ record.relationshipType.name }} · {{ record.relationshipType.category }} · v{{ record.currentVersion }}</p>
      <p class="mb-4 text-sm">
        <NuxtLink :to="href(record.sourceType, record.sourceId)" class="text-accent">{{ record.sourceLabel }}</NuxtLink>
        →
        <NuxtLink :to="href(record.targetType, record.targetId)" class="text-accent">{{ record.targetLabel }}</NuxtLink>
      </p>
      <p class="mono-meta mb-4">{{ record.startDate || 'No start' }} → {{ record.endDate || 'open' }} · {{ record.id }}</p>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Comment</h2>
        <MarkdownView :source="record.generalComment" />
      </section>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Consent</h2>
        <ul v-if="record.consent.length" class="space-y-2 text-sm">
          <li v-for="grant in record.consent" :key="grant.id">
            <StatusBadge :label="grant.status" :tone="grant.status === 'granted' ? 'good' : 'warn'" />
            <span class="mono-meta ml-2">{{ grant.scope }} · {{ grant.grantedAt || 'not granted' }}</span>
            <button v-if="grant.status === 'granted'" class="ml-2 border border-panel-border px-2 py-1 text-xs" type="button" @click="revoke(grant.id)">Withdraw consent</button>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-400">No consent grants are attached to this published record.</p>
      </section>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Change history</h2>
        <TimelineList v-if="record.history.length" :items="record.history" />
        <p v-else class="text-sm text-ink-400">No later revisions.</p>
      </section>
      <form class="border border-panel-border bg-panel p-4" @submit.prevent="correct">
        <h2 class="mb-2 text-sm font-semibold">Request a correction</h2>
        <p class="mb-2 text-xs text-ink-400">The published direction stays as-is until approval. A mirrored record, if one exists, is a different UUID and is not edited here.</p>
        <textarea v-model="comment" class="h-24 w-full border border-panel-border bg-ink-950 p-2 text-sm" aria-label="Corrected comment" />
        <button class="mt-2 border border-accent px-3 py-1.5 text-sm text-accent" type="submit">Queue correction</button>
      </form>
    </div>
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { RelationshipStatus } from '../../../lib/types'

const route = useRoute()
const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const pending = ref(true)
const error = ref('')
const record = ref<Awaited<ReturnType<typeof $api.relationships.get>> | null>(null)
const comment = ref('')
const showEdit = ref(false)
const draft = reactive({ generalComment: '', startDate: '', endDate: '', status: 'active' as RelationshipStatus })
const editError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: '' as 'save' | 'archive' })
const saving = ref(false)
const editDirty = computed(() => {
  if (!record.value || !showEdit.value) return false
  return draft.generalComment !== record.value.generalComment || draft.startDate !== (record.value.startDate || '') || draft.endDate !== (record.value.endDate || '') || draft.status !== record.value.status
})
useUnsavedGuard(editDirty)

function href(type: string, id: string) {
  return type === 'student' ? `/students/${id}` : `/groups/${id}`
}

function fillDraft() {
  if (!record.value) return
  draft.generalComment = record.value.generalComment
  draft.startDate = record.value.startDate || ''
  draft.endDate = record.value.endDate || ''
  draft.status = record.value.status
  comment.value = record.value.generalComment
}

async function load() {
  record.value = await $api.relationships.get(String(route.params.id))
  fillDraft()
}

function askSave() {
  editError.value = ''
  dialog.action = 'save'
  dialog.title = 'Publish a new relationship version?'
  dialog.message = 'This updates the comment, dates, and status of this direction only. A stale version is rejected.'
  dialog.confirmLabel = 'Save version'
  dialog.open = true
}

function askArchive() {
  dialog.action = 'archive'
  dialog.title = 'Archive this direction?'
  dialog.message = 'Only this relationship UUID is archived. A mirrored record remains until it is archived separately.'
  dialog.confirmLabel = 'Archive'
  dialog.open = true
}

async function confirmDialog() {
  const action = dialog.action
  dialog.open = false
  if (saving.value || !record.value) return
  saving.value = true
  try {
    if (action === 'save') await save()
    if (action === 'archive') await archive()
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!record.value) return
  editError.value = ''
  try {
    await $api.admin.patchRelationship(record.value.id, {
      generalComment: draft.generalComment,
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
      status: draft.status,
      baseVersion: record.value.currentVersion
    })
    toasts.push('Relationship updated.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function archive() {
  if (!record.value) return
  try {
    await $api.admin.archiveRelationship(record.value.id)
    toasts.push('Relationship archived.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

onMounted(async () => {
  try {
    await load()
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
})

async function correct() {
  if (!record.value) return
  try {
    await $api.submissions.create({
      entityType: 'relationship',
      operation: 'correction',
      targetEntityId: record.value.id,
      baseVersion: record.value.currentVersion,
      proposedData: { generalComment: comment.value }
    })
    toasts.push('Correction queued against this direction only.', 'success')
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

async function revoke(consentId: string) {
  try {
    await $api.submissions.revokeConsent(consentId)
    toasts.push('Consent withdrawn. Affected publication is archived when this grant covers it.', 'success')
    if (record.value) record.value = await $api.relationships.get(record.value.id)
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}
</script>
