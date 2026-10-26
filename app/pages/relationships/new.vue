<template>
  <div>
    <PageHeader
      :title="auth.isAdmin ? 'Publish a relationship' : 'Propose a relationship'"
      kicker="Relationship"
      :description="auth.isAdmin ? 'Administrators publish immediately. A personal relationship is not written when subject consent is missing. Publication cannot create that consent.' : 'This queues a review. It does not publish. Personal relationships stay blocked until required consent is valid.'"
    />
    <form class="grid max-w-3xl gap-4 border border-panel-border bg-panel p-4" @submit.prevent="askSubmit">
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-sm">Source type
          <select v-model="form.sourceType" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2">
            <option value="student">Student</option>
            <option value="group">Group</option>
          </select>
        </label>
        <label class="text-sm">Source
          <select v-model="form.sourceId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" required>
            <option value="">Select</option>
            <option v-for="option in optionsFor(form.sourceType)" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
        <label class="text-sm">Target type
          <select v-model="form.targetType" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2">
            <option value="student">Student</option>
            <option value="group">Group</option>
          </select>
        </label>
        <label class="text-sm">Target
          <select v-model="form.targetId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" required>
            <option value="">Select</option>
            <option v-for="option in optionsFor(form.targetType)" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
        </label>
      </div>
      <label class="text-sm">Relationship type
        <select v-model="form.relationshipTypeId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" required>
          <option value="">Select</option>
          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
      </label>
      <div class="grid gap-3 md:grid-cols-2">
        <label class="text-sm">Start date
          <input v-model="form.startDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" type="date" />
        </label>
        <label class="text-sm">End date
          <input v-model="form.endDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" type="date" />
        </label>
      </div>
      <label class="text-sm">Description
        <textarea v-model="form.generalComment" class="mt-1 h-28 w-full border border-panel-border bg-ink-950 p-2" required />
      </label>
      <label class="flex items-start gap-2 text-sm">
        <input v-model="form.createMirroredRelationship" type="checkbox" />
        <span v-if="auth.isAdmin">Create mirrored relationship. Both directions are written in one transaction as two independent records. If consent is missing, neither direction is written.</span>
        <span v-else>Create mirrored relationship. This submits both directions in one batch, with different IDs. Later edits stay independent. Leaving this unchecked does not create the reverse record.</span>
      </label>
      <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>
      <button class="w-fit bg-accent px-3 py-2 text-sm text-accent-fg" type="submit">{{ auth.isAdmin ? 'Publish relationship' : 'Queue for review' }}</button>
    </form>
    <ConfirmDialog :open="dialog.open" :title="dialog.title" :message="dialog.message" :confirm-label="dialog.confirmLabel" @cancel="dialog.open = false" @confirm="confirmDialog" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { EndpointType } from '../../../lib/types'

const { $api } = useNuxtApp()
const auth = useAuthStore()
const toasts = useToastStore()
const types = ref<Awaited<ReturnType<typeof $api.relationships.types>>>([])
const students = ref<Array<{ id: string; label: string }>>([])
const groups = ref<Array<{ id: string; label: string }>>([])
const form = reactive({
  sourceType: 'student' as EndpointType,
  sourceId: '',
  targetType: 'student' as EndpointType,
  targetId: '',
  relationshipTypeId: '',
  generalComment: '',
  startDate: '',
  endDate: '',
  createMirroredRelationship: false
})
const formError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm' })
const saving = ref(false)
const dirty = computed(() => Boolean(form.generalComment || form.sourceId || form.targetId || form.relationshipTypeId || form.startDate || form.endDate || form.createMirroredRelationship))
useUnsavedGuard(dirty)

function optionsFor(type: EndpointType) {
  return type === 'student' ? students.value : groups.value
}

function payload() {
  return {
    sourceType: form.sourceType,
    sourceId: form.sourceId,
    targetType: form.targetType,
    targetId: form.targetId,
    relationshipTypeId: form.relationshipTypeId,
    generalComment: form.generalComment,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    createMirroredRelationship: form.createMirroredRelationship
  }
}

function resetForm() {
  form.generalComment = ''
  form.sourceId = ''
  form.targetId = ''
  form.startDate = ''
  form.endDate = ''
  form.createMirroredRelationship = false
}

onMounted(async () => {
  types.value = await $api.relationships.types()
  students.value = (await $api.students.list({ pageSize: 50 })).data.map((student) => ({ id: student.id, label: student.displayName }))
  groups.value = (await $api.groups.list({ pageSize: 50 })).data.map((group) => ({ id: group.id, label: group.name }))
})

function askSubmit() {
  formError.value = ''
  dialog.title = auth.isAdmin ? 'Publish this relationship?' : 'Queue this relationship?'
  dialog.message = auth.isAdmin
    ? 'This publishes immediately when consent allows it. A personal relationship without subject consent is not written, and a mirror writes both directions or neither.'
    : 'This queues a review. It does not publish. Personal relationships stay blocked until required consent is valid.'
  dialog.confirmLabel = auth.isAdmin ? 'Publish' : 'Queue'
  dialog.open = true
}

async function confirmDialog() {
  dialog.open = false
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    if (auth.isAdmin) {
      const result = await $api.admin.createRelationship(payload())
      const published = Array.isArray(result.data) ? result.data : [result.data]
      toasts.push(result.message, 'success')
      resetForm()
      const first = published[0]
      await navigateTo(published.length === 1 && first ? `/relationships/${first.id}` : '/relationships')
      return
    }
    const result = await $api.submissions.createRelationship(payload())
    const count = Array.isArray(result.data) ? result.data.length : 1
    toasts.push(`${result.message} (${count} queued)`, 'success')
    resetForm()
    await navigateTo('/me/submissions')
  } catch (err) {
    formError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>
