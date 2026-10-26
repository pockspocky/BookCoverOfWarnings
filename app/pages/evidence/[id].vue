<template>
  <div>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Evidence unavailable" :description="error" />
    <div v-else-if="record">
      <PageHeader :title="record.summary" kicker="Evidence">
        <StatusBadge :label="record.verificationStatus" :tone="record.verificationStatus === 'verified' ? 'good' : 'warn'" />
        <StatusBadge :label="record.status" :tone="record.status === 'active' ? 'good' : 'muted'" />
        <button v-if="auth.isAdmin" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showEdit = !showEdit">Edit</button>
        <button v-if="auth.isAdmin && record.status === 'active'" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="askArchive">Archive</button>
      </PageHeader>
      <div v-if="auth.isAdmin" class="mb-6 space-y-4">
        <form v-if="showEdit" class="grid gap-2 border border-panel-border bg-panel p-4 md:grid-cols-2" @submit.prevent="askEdit">
          <h2 class="font-semibold md:col-span-2">Edit evidence</h2>
          <label class="text-sm md:col-span-2">Summary
            <textarea v-model="draft.summary" class="mt-1 h-16 w-full border border-panel-border bg-ink-950 p-2" required />
          </label>
          <label class="text-sm">Date
            <input v-model="draft.evidenceDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" required />
          </label>
          <label class="text-sm">HTTPS link
            <input v-model="draft.url" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="url" placeholder="https://" />
          </label>
          <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Save details</button>
        </form>
        <form class="flex flex-wrap items-end gap-2 border border-panel-border bg-panel p-4" @submit.prevent="askVerify">
          <h2 class="w-full text-sm font-semibold">Verification</h2>
          <p class="w-full text-xs text-ink-400">Administrator publications are already verified. Member submissions stay pending until you verify them. New records start at reliability 3 of 5.</p>
          <label class="text-sm">Status
            <select v-model="draft.verificationStatus" class="mt-1 block border border-panel-border bg-ink-950 px-2 py-1">
              <option value="pending">pending</option>
              <option value="verified">verified</option>
              <option value="insufficient">insufficient</option>
              <option value="disputed">disputed</option>
            </select>
          </label>
          <label class="text-sm">Reliability
            <input v-model="draft.reliability" class="mt-1 block w-24 border border-panel-border bg-ink-950 px-2 py-1" type="number" min="1" max="5" placeholder="1–5" />
          </label>
          <button class="border border-accent px-3 py-1.5 text-sm text-accent" type="submit">Save verification</button>
        </form>
        <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>
      </div>
      <dl class="mb-6 grid gap-3 text-sm md:grid-cols-4">
        <div><dt class="mono-meta">Date</dt><dd class="font-mono">{{ record.evidenceDate }}</dd></div>
        <div><dt class="mono-meta">Reliability</dt><dd>{{ record.reliabilityScore ?? 'Not scored' }}</dd></div>
        <div><dt class="mono-meta">Provider</dt><dd>{{ record.providerLabel }}</dd></div>
        <div><dt class="mono-meta">ID</dt><dd class="font-mono text-[11px]">{{ record.id }}</dd></div>
      </dl>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Approved links</h2>
        <ul v-if="record.urls.length" class="space-y-1 text-sm">
          <li v-for="url in record.urls" :key="url"><a :href="url" class="text-accent underline" rel="noreferrer">{{ url }}</a></li>
        </ul>
        <p v-else class="text-sm text-ink-400">No approved URLs.</p>
      </section>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Referencing traits</h2>
        <ul v-if="record.traits.length" class="space-y-2 text-sm">
          <li v-for="trait in record.traits" :key="trait.id">
            <NuxtLink :to="`/traits/${trait.id}`" class="text-accent">{{ trait.title }}</NuxtLink>
            · <NuxtLink :to="`/students/${trait.student.id}`">{{ trait.student.displayName }}</NuxtLink>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-400">No traits reference this evidence.</p>
      </section>
      <section class="mb-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Attachments</h2>
        <p class="mb-3 text-sm text-ink-400">Attachment contents are not indexed. Retrieval is authorized per request. Unauthorized files fail closed.</p>
        <ul v-if="record.attachments.length" class="space-y-2 text-sm">
          <li v-for="file in record.attachments" :key="file.id" class="flex flex-wrap items-center gap-2">
            <span>{{ file.fileName }}</span>
            <span class="mono-meta">{{ file.contentType }} · {{ file.sizeBytes }} bytes</span>
            <button class="border border-panel-border px-2 py-1 text-xs" type="button" @click="openAttachment(file.id)">Retrieve</button>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-400">No attachment metadata.</p>
        <form class="mt-4 grid gap-2 md:grid-cols-4" @submit.prevent="requestUpload">
          <label class="text-sm md:col-span-2">Attachment metadata
            <input class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="file" @change="onFile" />
          </label>
          <p class="self-end text-xs text-ink-400 md:col-span-2">The server checks the file type and size, then returns a short-lived upload URL. File bytes go to object storage, not into search.</p>
          <button class="border border-accent px-3 py-2 text-sm text-accent md:col-span-1" type="submit" :disabled="!uploadMeta">Request upload authorization</button>
        </form>
        <p v-if="ticket" class="mt-3 font-mono text-xs">Ticket {{ ticket.uploadToken }} · expires {{ ticket.expiresAt }}</p>
      </section>
    </div>
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { AttachmentUploadAuthorization, VerificationStatus } from '../../../lib/types'

const route = useRoute()
const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const pending = ref(true)
const error = ref('')
const record = ref<Awaited<ReturnType<typeof $api.evidence.get>> | null>(null)
const showEdit = ref(false)
const draft = reactive({ summary: '', evidenceDate: '', url: '', verificationStatus: 'pending' as VerificationStatus, reliability: '' })
const formError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: '' as 'edit' | 'archive' | 'verify' })
const saving = ref(false)
const editDirty = computed(() => {
  if (!record.value) return false
  const url = record.value.urls[0] ?? ''
  const reliability = record.value.reliabilityScore == null ? '' : String(record.value.reliabilityScore)
  const details = showEdit.value && (draft.summary !== record.value.summary || draft.evidenceDate !== record.value.evidenceDate || draft.url !== url)
  return details || draft.verificationStatus !== record.value.verificationStatus || draft.reliability !== reliability
})
useUnsavedGuard(editDirty)
const uploadMeta = ref<{ fileName: string; contentType: string; sizeBytes: number } | null>(null)
const ticket = ref<AttachmentUploadAuthorization | null>(null)

function fillDraft() {
  if (!record.value) return
  draft.summary = record.value.summary
  draft.evidenceDate = record.value.evidenceDate
  draft.url = record.value.urls[0] ?? ''
  draft.verificationStatus = record.value.verificationStatus
  draft.reliability = record.value.reliabilityScore == null ? '' : String(record.value.reliabilityScore)
}

function httpsUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (!trimmed.startsWith('https://')) return null
  return [trimmed]
}

async function load() {
  record.value = await $api.evidence.get(String(route.params.id))
  fillDraft()
}

function askEdit() {
  formError.value = ''
  if (draft.url.trim() && httpsUrl(draft.url) == null) {
    formError.value = 'urls: Only HTTPS URLs are permitted.'
    return
  }
  dialog.action = 'edit'
  dialog.title = 'Save evidence details?'
  dialog.message = 'This updates the published summary, date, and HTTPS link.'
  dialog.confirmLabel = 'Save details'
  dialog.open = true
}

function askArchive() {
  dialog.action = 'archive'
  dialog.title = 'Archive evidence?'
  dialog.message = 'The evidence record is archived. It is not deleted, and traits that cited it stay published.'
  dialog.confirmLabel = 'Archive'
  dialog.open = true
}

function askVerify() {
  dialog.action = 'verify'
  dialog.title = 'Save verification?'
  dialog.message = 'This updates the verification status and reliability score on the published evidence.'
  dialog.confirmLabel = 'Save verification'
  dialog.open = true
}

async function confirmDialog() {
  const action = dialog.action
  dialog.open = false
  if (saving.value || !record.value) return
  saving.value = true
  try {
    if (action === 'edit') await saveDetails()
    if (action === 'archive') await archive()
    if (action === 'verify') await verify()
  } finally {
    saving.value = false
  }
}

async function saveDetails() {
  if (!record.value) return
  const urls = httpsUrl(draft.url)
  if (urls == null) {
    formError.value = 'urls: Only HTTPS URLs are permitted.'
    return
  }
  const nextUrls = urls.length ? [urls[0] as string, ...record.value.urls.slice(1)] : record.value.urls.slice(1)
  formError.value = ''
  try {
    await $api.admin.patchEvidence(record.value.id, {
      summary: draft.summary,
      evidenceDate: draft.evidenceDate,
      urls: nextUrls
    })
    toasts.push('Evidence updated.', 'success')
    await load()
  } catch (err) {
    formError.value = errorMessage(err)
    toasts.push(formError.value, 'error')
  }
}

async function archive() {
  if (!record.value) return
  formError.value = ''
  try {
    await $api.admin.archiveEvidence(record.value.id)
    toasts.push('Evidence archived.', 'success')
    await load()
  } catch (err) {
    formError.value = errorMessage(err)
    toasts.push(formError.value, 'error')
  }
}

async function verify() {
  if (!record.value) return
  formError.value = ''
  try {
    await $api.admin.verifyEvidence(record.value.id, {
      verificationStatus: draft.verificationStatus,
      reliabilityScore: draft.reliability ? Number(draft.reliability) : null
    })
    toasts.push('Verification saved.', 'success')
    await load()
  } catch (err) {
    formError.value = errorMessage(err)
    toasts.push(formError.value, 'error')
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

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  uploadMeta.value = file
    ? { fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size }
    : null
}

async function openAttachment(attachmentId: string) {
  if (!record.value) return
  try {
    const result = await $api.evidence.attachment(record.value.id, attachmentId)
    toasts.push(`Authorized retrieval for ${result.fileName}. Contents are not displayed in the directory.`, 'success')
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

async function requestUpload() {
  if (!record.value || !uploadMeta.value) return
  try {
    ticket.value = await $api.evidence.authorizeUpload(record.value.id, uploadMeta.value)
    toasts.push('Upload authorization issued. No file bytes were stored.', 'success')
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}
</script>
