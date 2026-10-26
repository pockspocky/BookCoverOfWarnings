<template>
  <div v-if="trait">
    <PageHeader :title="trait.title" kicker="Trait">
      <StatusBadge :label="trait.status" />
      <button class="border border-accent px-3 py-1.5 text-sm text-accent" type="button" @click="correct">Submit correction</button>
      <button v-if="auth.isAdmin" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showEdit = !showEdit">Edit</button>
      <button v-if="auth.isAdmin && trait.status === 'active'" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="askArchive">Archive</button>
    </PageHeader>
    <form v-if="auth.isAdmin && showEdit" class="mb-6 border border-panel-border bg-panel p-4" @submit.prevent="askSave">
      <h2 class="mb-3 font-semibold">Edit trait</h2>
      <label class="mb-2 block text-sm">Title
        <input v-model="draft.title" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
      </label>
      <label class="mb-2 block text-sm">Category
        <select v-model="draft.categoryId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </label>
      <label class="mb-3 block text-sm">Description
        <textarea v-model="draft.description" class="mt-1 h-28 w-full border border-panel-border bg-ink-950 p-2" />
      </label>
      <p v-if="editError" class="mb-3 text-sm text-red-300">{{ editError }}</p>
      <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Save version</button>
    </form>
    <p class="mb-4 text-sm">Student: <NuxtLink :to="`/students/${trait.student.id}`" class="text-accent">{{ trait.student.displayName }}</NuxtLink> · {{ trait.category.name }} · v{{ trait.currentVersion }}</p>
    <MarkdownView :source="trait.description" />
    <h2 class="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-ink-400">Evidence</h2>
    <ul class="space-y-2 text-sm">
      <li v-for="item in trait.evidence" :key="item.id">
        <NuxtLink :to="`/evidence/${item.id}`" class="text-accent">{{ item.summary }}</NuxtLink>
        · {{ item.verificationStatus }} · reliability {{ item.reliabilityScore ?? 'n/a' }}
      </li>
    </ul>
    <div v-if="auth.isAdmin && trait.status === 'active'" class="mt-4 grid gap-4 border border-panel-border bg-panel p-4 md:grid-cols-2">
      <form class="space-y-2" @submit.prevent="askAttach">
        <h3 class="text-sm font-semibold">Attach existing evidence</h3>
        <label class="block text-sm">Evidence
          <select v-model="attachId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
            <option value="">Select</option>
            <option v-for="item in availableEvidence" :key="item.id" :value="item.id">{{ item.summary }}</option>
          </select>
        </label>
        <p v-if="attachError" class="text-sm text-red-300">{{ attachError }}</p>
        <button class="border border-accent px-3 py-1.5 text-sm text-accent" type="submit">Attach evidence</button>
      </form>
      <form class="space-y-2" @submit.prevent="askCreateEvidence">
        <h3 class="text-sm font-semibold">Publish evidence on this trait</h3>
        <label class="block text-sm">Summary
          <textarea v-model="evidenceForm.summary" class="mt-1 h-20 w-full border border-panel-border bg-ink-950 p-2" required />
        </label>
        <label class="block text-sm">Date
          <input v-model="evidenceForm.evidenceDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" required />
        </label>
        <label class="block text-sm">HTTPS link
          <input v-model="evidenceForm.url" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="url" placeholder="https://" />
        </label>
        <p v-if="evidenceError" class="text-sm text-red-300">{{ evidenceError }}</p>
        <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Publish evidence</button>
      </form>
    </div>
    <h2 class="mb-2 mt-6 text-sm font-semibold uppercase tracking-wider text-ink-400">History</h2>
    <TimelineList :items="trait.history" />
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const route = useRoute()
const auth = useAuthStore()
const toasts = useToastStore()
const trait = ref<Awaited<ReturnType<typeof $api.traits.get>> | null>(null)
const categories = ref<Awaited<ReturnType<typeof $api.traits.categories>>>([])
const evidenceRows = ref<Awaited<ReturnType<typeof $api.evidence.list>>['data']>([])
const showEdit = ref(false)
const draft = reactive({ title: '', categoryId: '', description: '' })
const evidenceForm = reactive({ summary: '', evidenceDate: '', url: '' })
const attachId = ref('')
const editError = ref('')
const attachError = ref('')
const evidenceError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: '' as 'save' | 'archive' | 'attach' | 'create-evidence' })
const saving = ref(false)
const availableEvidence = computed(() => {
  const linked = new Set(trait.value?.evidence.map((item) => item.id) ?? [])
  return evidenceRows.value.filter((item) => item.status === 'active' && !linked.has(item.id))
})
const editDirty = computed(() => {
  if (!trait.value || !showEdit.value) return false
  return draft.title !== trait.value.title || draft.categoryId !== trait.value.categoryId || draft.description !== (trait.value.description ?? '')
})
useUnsavedGuard(computed(() => editDirty.value || Boolean(attachId.value || evidenceForm.summary || evidenceForm.evidenceDate || evidenceForm.url)))

function httpsUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return []
  if (!trimmed.startsWith('https://')) return null
  return [trimmed]
}

function fillDraft() {
  if (!trait.value) return
  draft.title = trait.value.title
  draft.categoryId = trait.value.categoryId
  draft.description = trait.value.description ?? ''
}

async function load() {
  const id = String(route.params.id)
  trait.value = await $api.traits.get(id)
  fillDraft()
  if (!auth.isAdmin) return
  const [categoryRows, evidencePage] = await Promise.all([
    $api.traits.categories(),
    $api.evidence.list({ pageSize: 50 })
  ])
  categories.value = categoryRows
  evidenceRows.value = evidencePage.data
}

function askSave() {
  editError.value = ''
  dialog.action = 'save'
  dialog.title = 'Publish a new trait version?'
  dialog.message = 'This publishes a new version. A stale version is rejected and nothing is written.'
  dialog.confirmLabel = 'Save version'
  dialog.open = true
}

function askArchive() {
  dialog.action = 'archive'
  dialog.title = 'Archive trait?'
  dialog.message = 'The trait is archived. Evidence shared with other traits stays published, and version history stays.'
  dialog.confirmLabel = 'Archive trait'
  dialog.open = true
}

function askAttach() {
  attachError.value = ''
  dialog.action = 'attach'
  dialog.title = 'Attach this evidence?'
  dialog.message = 'This links the existing evidence to this trait. Attaching it again does not create a second link.'
  dialog.confirmLabel = 'Attach evidence'
  dialog.open = true
}

function askCreateEvidence() {
  evidenceError.value = ''
  if (evidenceForm.url.trim() && httpsUrl(evidenceForm.url) == null) {
    evidenceError.value = 'urls: Only HTTPS URLs are permitted.'
    return
  }
  dialog.action = 'create-evidence'
  dialog.title = 'Publish this evidence?'
  dialog.message = 'This writes a published evidence record and links it to this trait. It does not enter the review queue.'
  dialog.confirmLabel = 'Publish'
  dialog.open = true
}

async function confirmDialog() {
  const action = dialog.action
  dialog.open = false
  if (saving.value || !trait.value) return
  saving.value = true
  try {
    if (action === 'save') await save()
    if (action === 'archive') await archive()
    if (action === 'attach') await attach()
    if (action === 'create-evidence') await createEvidence()
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!trait.value) return
  editError.value = ''
  try {
    await $api.admin.patchTrait(trait.value.id, {
      title: draft.title,
      categoryId: draft.categoryId,
      description: draft.description.trim() ? draft.description : null,
      baseVersion: trait.value.currentVersion
    })
    toasts.push('Trait version published.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function archive() {
  if (!trait.value) return
  try {
    await $api.admin.archiveTrait(trait.value.id)
    toasts.push('Trait archived. Shared evidence remains.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function attach() {
  if (!trait.value || !attachId.value) return
  attachError.value = ''
  try {
    await $api.admin.attachTraitEvidence(trait.value.id, { evidenceId: attachId.value })
    attachId.value = ''
    toasts.push('Evidence attached.', 'success')
    await load()
  } catch (err) {
    attachError.value = errorMessage(err)
    toasts.push(attachError.value, 'error')
  }
}

async function createEvidence() {
  if (!trait.value) return
  const urls = httpsUrl(evidenceForm.url)
  if (urls == null) {
    evidenceError.value = 'urls: Only HTTPS URLs are permitted.'
    return
  }
  evidenceError.value = ''
  try {
    await $api.admin.createEvidence({
      summary: evidenceForm.summary,
      evidenceDate: evidenceForm.evidenceDate,
      urls,
      traitIds: [trait.value.id]
    })
    evidenceForm.summary = ''
    evidenceForm.evidenceDate = ''
    evidenceForm.url = ''
    toasts.push('Evidence published.', 'success')
    await load()
  } catch (err) {
    evidenceError.value = errorMessage(err)
    toasts.push(evidenceError.value, 'error')
  }
}

async function correct() {
  if (!trait.value) return
  try {
    await $api.submissions.create({
      entityType: 'trait',
      operation: 'correction',
      targetEntityId: trait.value.id,
      baseVersion: trait.value.currentVersion,
      proposedData: { description: trait.value.description }
    })
    toasts.push('Correction queued.', 'success')
  } catch (error) {
    toasts.push(errorMessage(error), 'error')
  }
}

onMounted(load)
</script>
