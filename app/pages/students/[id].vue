<template>
  <div>
    <SkeletonBlock v-if="pending" />
    <div v-else-if="student">
      <PageHeader :title="student.displayName" kicker="Student" :description="`Class of ${student.graduationYear}`">
        <StatusBadge v-if="student.archivedAt" label="archived" tone="muted" />
        <NuxtLink :to="`/graph?node=student:${student.id}`" class="border border-panel-border px-3 py-1.5 text-sm">Graph</NuxtLink>
        <button class="border border-accent px-3 py-1.5 text-sm text-accent" type="button" @click="showCorrection = true">Request correction</button>
        <button v-if="auth.isAdmin" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showEdit = !showEdit">Edit</button>
        <button v-if="auth.isAdmin && !student.archivedAt" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="askArchive">Archive</button>
      </PageHeader>
      <form v-if="auth.isAdmin && showEdit" class="mb-6 border border-panel-border bg-panel p-4" @submit.prevent="askSave">
        <h2 class="mb-3 font-semibold">Edit record</h2>
        <label class="mb-2 block text-sm">Display name
          <input v-model="draft.displayName" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
        </label>
        <label class="mb-2 block text-sm">Graduation year
          <input v-model.number="draft.graduationYear" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="number" min="1900" max="2200" required />
        </label>
        <label class="mb-3 block text-sm">General comment
          <textarea v-model="draft.generalComment" class="mt-1 h-28 w-full border border-panel-border bg-ink-950 p-2" />
        </label>
        <p v-if="editError" class="mb-3 text-sm text-red-300">{{ editError }}</p>
        <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Save version</button>
      </form>
      <div class="grid gap-6 lg:grid-cols-3">
        <section class="lg:col-span-2 space-y-6">
          <div class="border border-panel-border bg-panel p-4">
            <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">General comment</h2>
            <MarkdownView :source="student.generalComment" />
          </div>
          <div class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Traits</h2>
            <ul class="space-y-2">
              <li v-for="trait in student.traits" :key="trait.id">
                <NuxtLink :to="`/traits/${trait.id}`" class="text-accent">{{ trait.title }}</NuxtLink>
                <StatusBadge class="ml-2" :label="trait.status" :tone="trait.status === 'active' ? 'good' : 'muted'" />
              </li>
            </ul>
          </div>
          <div class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Groups</h2>
            <ul class="space-y-2 text-sm">
              <li v-for="item in student.memberships" :key="item.id">
                <NuxtLink :to="`/groups/${item.group.id}`" class="text-accent">{{ item.group.name }}</NuxtLink>
                · {{ item.role.name }} · {{ item.startDate }} → {{ item.endDate || 'present' }}
              </li>
            </ul>
          </div>
          <div class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Relationships</h2>
            <ul class="space-y-2 text-sm">
              <li v-for="rel in relationships" :key="rel.id">
                <NuxtLink :to="`/relationships/${rel.id}`" class="text-accent">{{ rel.sourceLabel }} → {{ rel.targetLabel }}</NuxtLink>
                <span class="ml-2">{{ rel.relationshipType.name }}</span>
                <span class="mono-meta ml-2">{{ rel.status }}</span>
              </li>
            </ul>
          </div>
          <div class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Version history</h2>
            <TimelineList v-if="history.length" :items="history" />
            <p v-else class="text-sm text-ink-400">No published revisions beyond the original record.</p>
          </div>
        </section>
        <aside class="space-y-4">
          <p class="mono-meta">{{ student.id }}</p>
          <MiniGraph v-if="graph" :graph="graph" />
        </aside>
      </div>
      <div v-if="showCorrection" class="mt-6 border border-panel-border bg-panel p-4">
        <h2 class="mb-2 font-semibold">Submit a correction</h2>
        <p class="mb-3 text-sm text-ink-400">The published record stays unchanged until an administrator approves.</p>
        <textarea v-model="correction" class="h-28 w-full border border-panel-border bg-ink-950 p-2 text-sm" />
        <div class="mt-3 flex gap-2">
          <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="button" @click="submitCorrection">Queue correction</button>
          <button class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showCorrection = false">Cancel</button>
        </div>
      </div>
    </div>
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const route = useRoute()
const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const pending = ref(true)
const student = ref<Awaited<ReturnType<typeof $api.students.get>> | null>(null)
const history = ref<Awaited<ReturnType<typeof $api.students.history>>>([])
const relationships = ref<Awaited<ReturnType<typeof $api.students.relationships>>['data']>([])
const graph = ref<Awaited<ReturnType<typeof $api.graph.neighborhood>> | null>(null)
const showCorrection = ref(false)
const correction = ref('')
const showEdit = ref(false)
const draft = reactive({ displayName: '', graduationYear: 0, generalComment: '' })
const editError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: '' as 'save' | 'archive' })
const saving = ref(false)
const editDirty = computed(() => Boolean(student.value) && showEdit.value && (draft.displayName !== student.value?.displayName || draft.generalComment !== student.value?.generalComment || draft.graduationYear !== student.value?.graduationYear))
useUnsavedGuard(editDirty)

function fillDraft() {
  if (!student.value) return
  draft.displayName = student.value.displayName
  draft.graduationYear = student.value.graduationYear
  draft.generalComment = student.value.generalComment
}

async function load() {
  const id = String(route.params.id)
  student.value = await $api.students.get(id)
  history.value = await $api.students.history(id)
  relationships.value = (await $api.students.relationships(id)).data
  graph.value = await $api.graph.neighborhood('student', id, 1)
  fillDraft()
}

function askSave() {
  if (!student.value) return
  editError.value = ''
  if (!Number.isInteger(draft.graduationYear)) {
    editError.value = 'graduationYear: Graduation year is invalid.'
    return
  }
  dialog.action = 'save'
  dialog.title = 'Publish a new version?'
  dialog.message = 'This publishes a new version of the student record. A stale version is rejected and nothing is written.'
  dialog.confirmLabel = 'Save version'
  dialog.open = true
}

function askArchive() {
  dialog.action = 'archive'
  dialog.title = 'Archive student?'
  dialog.message = 'The student leaves the default directory. Related evidence is not deleted. Version history stays.'
  dialog.confirmLabel = 'Archive'
  dialog.open = true
}

async function confirmDialog() {
  const action = dialog.action
  dialog.open = false
  if (saving.value || !student.value) return
  saving.value = true
  try {
    if (action === 'save') await save()
    if (action === 'archive') await archive()
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!student.value) return
  editError.value = ''
  try {
    await $api.admin.patchStudent(student.value.id, { ...draft, baseVersion: student.value.currentVersion })
    toasts.push('Student version published.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function archive() {
  if (!student.value) return
  try {
    await $api.admin.archiveStudent(student.value.id)
    toasts.push('Student archived.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

onMounted(async () => {
  await load()
  pending.value = false
})

async function submitCorrection() {
  if (!student.value) return
  try {
    await $api.submissions.create({
      entityType: 'student',
      operation: 'correction',
      targetEntityId: student.value.id,
      baseVersion: student.value.currentVersion,
      proposedData: { generalComment: correction.value }
    })
    toasts.push('Correction queued. It is not published yet.', 'success')
    showCorrection.value = false
  } catch (error) {
    toasts.push(errorMessage(error), 'error')
  }
}
</script>
