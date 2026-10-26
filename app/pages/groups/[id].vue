<template>
  <div>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Group unavailable" :description="error" />
    <div v-else-if="group">
      <PageHeader :title="group.name" kicker="Group" :description="`Version ${group.currentVersion}`">
        <StatusBadge :label="group.status" />
        <NuxtLink :to="`/graph?node=group:${group.id}`" class="border border-panel-border px-3 py-1.5 text-sm">Graph</NuxtLink>
        <button v-if="auth.isAdmin" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="showEdit = !showEdit">Edit</button>
        <button v-if="auth.isAdmin && group.status !== 'archived'" class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="askArchive">Archive</button>
      </PageHeader>
      <form v-if="auth.isAdmin && showEdit" class="mb-6 border border-panel-border bg-panel p-4" @submit.prevent="askSave">
        <h2 class="mb-3 font-semibold">Edit group</h2>
        <label class="mb-2 block text-sm">Name
          <input v-model="draft.name" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required />
        </label>
        <label class="mb-3 block text-sm">Description
          <textarea v-model="draft.description" class="mt-1 h-28 w-full border border-panel-border bg-ink-950 p-2" required />
        </label>
        <p v-if="editError" class="mb-3 text-sm text-red-300">{{ editError }}</p>
        <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Save version</button>
      </form>
      <div class="grid gap-6 lg:grid-cols-3">
        <div class="space-y-6 lg:col-span-2">
          <section class="border border-panel-border bg-panel p-4">
            <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Description</h2>
            <MarkdownView :source="group.description" />
          </section>
          <section class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Current members</h2>
            <ul v-if="group.currentMembers.length" class="space-y-3 text-sm">
              <li v-for="member in group.currentMembers" :key="member.id" class="flex flex-wrap items-end justify-between gap-2">
                <span>
                  <NuxtLink :to="`/students/${member.student.id}`" class="text-accent">{{ member.student.displayName }}</NuxtLink>
                  · {{ member.role.name }} · {{ member.startDate }} → present
                </span>
                <span v-if="auth.isAdmin" class="flex items-end gap-2">
                  <label class="text-xs">End date
                    <input v-model="endDates[member.id]" class="mt-1 block border border-panel-border bg-ink-950 px-2 py-1" type="date" />
                  </label>
                  <button class="border border-panel-border px-2 py-1 text-xs" type="button" @click="askEnd(member.id)">End membership</button>
                </span>
              </li>
            </ul>
            <p v-else class="text-sm text-ink-400">No current members.</p>
          </section>
          <section class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Historical members</h2>
            <ul v-if="group.historicalMembers.length" class="space-y-2 text-sm">
              <li v-for="member in group.historicalMembers" :key="member.id">
                <NuxtLink :to="`/students/${member.student.id}`" class="text-accent">{{ member.student.displayName }}</NuxtLink>
                · {{ member.role.name }} · {{ member.startDate }} → {{ member.endDate }}
              </li>
            </ul>
            <p v-else class="text-sm text-ink-400">No ended memberships.</p>
          </section>
          <section class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Relationships</h2>
            <ul v-if="relationships.length" class="space-y-2 text-sm">
              <li v-for="rel in relationships" :key="rel.id">
                <NuxtLink :to="`/relationships/${rel.id}`" class="text-accent">{{ rel.sourceLabel }} → {{ rel.targetLabel }}</NuxtLink>
                · {{ rel.relationshipType.name }} · {{ rel.status }}
              </li>
            </ul>
            <p v-else class="text-sm text-ink-400">No approved relationships.</p>
          </section>
          <section class="border border-panel-border bg-panel p-4">
            <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-400">Version history</h2>
            <TimelineList v-if="group.history.length" :items="group.history" />
            <p v-else class="text-sm text-ink-400">No published revisions beyond the original record.</p>
          </section>
        </div>
        <aside class="space-y-4">
          <MiniGraph v-if="graph" :graph="graph" />
          <form v-if="auth.isAdmin" class="border border-panel-border bg-panel p-4" @submit.prevent="askJoin">
            <h2 class="mb-2 text-sm font-semibold">Add a current member</h2>
            <p class="mb-3 text-xs text-ink-400">This publishes the membership immediately. Ending it later sets an end date and keeps the row.</p>
            <label class="mb-2 block text-sm">Student
              <select v-model="proposal.studentId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
                <option value="">Select</option>
                <option v-for="student in students" :key="student.id" :value="student.id">{{ student.displayName }}</option>
              </select>
            </label>
            <label class="mb-2 block text-sm">Role
              <select v-model="proposal.roleId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
                <option value="">Select</option>
                <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
              </select>
            </label>
            <label class="mb-3 block text-sm">Start
              <input v-model="proposal.startDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" required />
            </label>
            <p v-if="formError" class="mb-3 text-sm text-red-300">{{ formError }}</p>
            <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Add member</button>
          </form>
          <form v-else class="border border-panel-border bg-panel p-4" @submit.prevent="askPropose">
            <h2 class="mb-2 text-sm font-semibold">Propose a role</h2>
            <p class="mb-3 text-xs text-ink-400">Members can propose a membership role. An administrator must approve it before it is published.</p>
            <label class="mb-2 block text-sm">Student
              <select v-model="proposal.studentId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
                <option value="">Select</option>
                <option v-for="student in students" :key="student.id" :value="student.id">{{ student.displayName }}</option>
              </select>
            </label>
            <label class="mb-2 block text-sm">Role
              <select v-model="proposal.roleId" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" required>
                <option value="">Select</option>
                <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
              </select>
            </label>
            <label class="mb-2 block text-sm">Start
              <input v-model="proposal.startDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" required />
            </label>
            <label class="mb-3 block text-sm">End
              <input v-model="proposal.endDate" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="date" />
            </label>
            <p v-if="formError" class="mb-3 text-sm text-red-300">{{ formError }}</p>
            <button class="bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit">Queue proposal</button>
          </form>
        </aside>
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
const error = ref('')
const formError = ref('')
const group = ref<Awaited<ReturnType<typeof $api.groups.get>> | null>(null)
const relationships = ref<Awaited<ReturnType<typeof $api.groups.relationships>>['data']>([])
const graph = ref<Awaited<ReturnType<typeof $api.graph.neighborhood>> | null>(null)
const students = ref<Awaited<ReturnType<typeof $api.students.list>>['data']>([])
const roles = ref<Awaited<ReturnType<typeof $api.groups.roles>>>([])
const proposal = reactive({ studentId: '', roleId: '', startDate: '', endDate: '' })
const endDates = reactive<Record<string, string>>({})
const endTarget = ref('')
const showEdit = ref(false)
const draft = reactive({ name: '', description: '' })
const editError = ref('')
const dialog = reactive({ open: false, title: '', message: '', confirmLabel: 'Confirm', action: '' as 'join' | 'propose' | 'end' | 'save' | 'archive' })
const saving = ref(false)
const editDirty = computed(() => Boolean(showEdit.value && group.value) && (draft.name !== group.value?.name || draft.description !== group.value?.description))
const dirty = computed(() => editDirty.value || Boolean(proposal.studentId || proposal.roleId || proposal.startDate || proposal.endDate) || Object.values(endDates).some((value) => value !== today()))
useUnsavedGuard(dirty)

function today() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

async function load() {
  const id = String(route.params.id)
  group.value = await $api.groups.get(id)
  relationships.value = (await $api.groups.relationships(id)).data
  graph.value = await $api.graph.neighborhood('group', id, 1)
  students.value = (await $api.students.list({ pageSize: 50 })).data
  roles.value = await $api.groups.roles()
  const activeIds = new Set(group.value.currentMembers.map((member) => member.id))
  for (const key of Object.keys(endDates)) {
    if (!activeIds.has(key)) delete endDates[key]
  }
  for (const member of group.value.currentMembers) {
    if (!endDates[member.id]) endDates[member.id] = today()
  }
  draft.name = group.value.name
  draft.description = group.value.description
}

function askJoin() {
  formError.value = ''
  dialog.action = 'join'
  dialog.title = 'Add this member?'
  dialog.message = 'This publishes the membership immediately. It does not enter the review queue.'
  dialog.confirmLabel = 'Add member'
  dialog.open = true
}

function askPropose() {
  formError.value = ''
  dialog.action = 'propose'
  dialog.title = 'Queue this role proposal?'
  dialog.message = 'This submits a proposal. It is not published until an administrator approves it.'
  dialog.confirmLabel = 'Queue proposal'
  dialog.open = true
}

function askSave() {
  editError.value = ''
  dialog.action = 'save'
  dialog.title = 'Save this group version?'
  dialog.message = 'This publishes a new version of the name and description. A stale version is rejected.'
  dialog.confirmLabel = 'Save version'
  dialog.open = true
}

function askArchive() {
  dialog.action = 'archive'
  dialog.title = 'Archive this group?'
  dialog.message = 'The group leaves the active directory. Membership history is kept.'
  dialog.confirmLabel = 'Archive'
  dialog.open = true
}

function askEnd(memberId: string) {
  formError.value = ''
  if (!endDates[memberId]) {
    formError.value = 'endDate: An end date is required.'
    return
  }
  endTarget.value = memberId
  dialog.action = 'end'
  dialog.title = 'End this membership?'
  dialog.message = 'The membership stays in the history with this end date. It is not deleted.'
  dialog.confirmLabel = 'End membership'
  dialog.open = true
}

async function confirmDialog() {
  const action = dialog.action
  dialog.open = false
  if (saving.value || !group.value) return
  saving.value = true
  try {
    if (action === 'join') await join()
    if (action === 'propose') await propose()
    if (action === 'end') await endMembership()
    if (action === 'save') await saveGroup()
    if (action === 'archive') await archiveGroup()
  } finally {
    saving.value = false
  }
}

async function saveGroup() {
  if (!group.value) return
  editError.value = ''
  try {
    await $api.admin.patchGroup(group.value.id, {
      name: draft.name,
      description: draft.description,
      baseVersion: group.value.currentVersion
    })
    toasts.push('Group updated.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function archiveGroup() {
  if (!group.value) return
  try {
    await $api.admin.patchGroup(group.value.id, { status: 'archived' })
    toasts.push('Group archived.', 'success')
    await load()
  } catch (err) {
    editError.value = errorMessage(err)
    toasts.push(editError.value, 'error')
  }
}

async function join() {
  if (!group.value) return
  formError.value = ''
  try {
    await $api.admin.createMembership({
      groupId: group.value.id,
      studentId: proposal.studentId,
      roleId: proposal.roleId,
      startDate: proposal.startDate,
      endDate: null
    })
    proposal.studentId = ''
    proposal.roleId = ''
    proposal.startDate = ''
    toasts.push('Membership published.', 'success')
    await load()
  } catch (err) {
    formError.value = errorMessage(err)
    toasts.push(formError.value, 'error')
  }
}

async function propose() {
  if (!group.value) return
  formError.value = ''
  try {
    await $api.submissions.create({
      entityType: 'group_membership',
      operation: 'create',
      proposedData: {
        groupId: group.value.id,
        studentId: proposal.studentId,
        roleId: proposal.roleId,
        startDate: proposal.startDate,
        endDate: proposal.endDate || null
      }
    })
    proposal.studentId = ''
    proposal.roleId = ''
    proposal.startDate = ''
    proposal.endDate = ''
    toasts.push('Role proposal queued. It is not published yet.', 'success')
  } catch (err) {
    formError.value = errorMessage(err)
    toasts.push(formError.value, 'error')
  }
}

async function endMembership() {
  const id = endTarget.value
  const endDate = endDates[id]
  if (!id || !endDate) return
  formError.value = ''
  try {
    await $api.admin.patchMembership(id, { endDate })
    toasts.push('Membership ended. The history row was kept.', 'success')
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
</script>
