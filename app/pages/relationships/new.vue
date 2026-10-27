<template>
  <div>
    <PageHeader
      title="Create a relationship"
      kicker="Relationship"
      description="Administrators publish immediately. Choose an existing type or type a new one. A name that does not already exist is saved as a new type, ignoring letter case. A personal relationship is not written when subject consent is missing."
    />
    <EmptyState v-if="!auth.isAdmin" title="Administrators create relationships" description="Members cannot propose a relationship. An administrator publishes it directly." />
    <form v-else class="grid max-w-3xl gap-4 border border-panel-border bg-panel p-4" @submit.prevent="askSubmit">
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
        <input v-model="form.relationshipTypeName" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-2" list="relationship-type-options" maxlength="200" autocomplete="off" placeholder="Choose or type a type" required />
        <datalist id="relationship-type-options">
          <option v-for="type in types" :key="type.id" :value="type.name" />
        </datalist>
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
        <span>Create mirrored relationship. Both directions are written in one transaction as two independent records. If consent is missing, neither direction is written.</span>
      </label>
      <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>
      <button class="w-fit bg-accent px-3 py-2 text-sm text-accent-fg" type="submit">Create relationship</button>
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
  relationshipTypeName: '',
  generalComment: '',
  startDate: '',
  endDate: '',
  createMirroredRelationship: false
})
const formError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm' })
const saving = ref(false)
const dirty = computed(() => Boolean(form.generalComment || form.sourceId || form.targetId || form.relationshipTypeName || form.startDate || form.endDate || form.createMirroredRelationship))
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
    relationshipTypeName: form.relationshipTypeName.trim(),
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
  form.relationshipTypeName = ''
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
  dialog.title = 'Create this relationship?'
  dialog.message = 'This publishes immediately when consent allows it. A typed type is reused when its name already exists, ignoring letter case, and created when it does not. A mirror writes both directions or neither.'
  dialog.confirmLabel = 'Create'
  dialog.open = true
}

async function confirmDialog() {
  dialog.open = false
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    const result = await $api.admin.createRelationship(payload())
    const published = Array.isArray(result.data) ? result.data : [result.data]
    toasts.push(result.message, 'success')
    resetForm()
    const first = published[0]
    await navigateTo(published.length === 1 && first ? `/relationships/${first.id}` : '/relationships')
  } catch (err) {
    formError.value = errorMessage(err)
  } finally {
    saving.value = false
  }
}
</script>
