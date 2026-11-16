<template>
  <div class="space-y-8">
    <PageHeader title="Categories and types" kicker="Admin" description="Trait categories, relationship types, and group roles are managed here. They describe non-sensitive published structure." />
    <section>
      <h2 class="mb-3 font-semibold">Trait categories</h2>
      <form class="mb-3 flex flex-wrap gap-2" @submit.prevent="addCategory">
        <input v-model="categoryName" class="border border-panel-border bg-panel px-2 py-1" placeholder="Name" aria-label="Category name" required />
        <input v-model="categoryDescription" class="min-w-64 border border-panel-border bg-panel px-2 py-1" placeholder="Description" aria-label="Category description" required />
        <button class="bg-accent px-3 py-1 text-sm text-accent-fg" type="submit">Add category</button>
      </form>
      <ul class="space-y-2 text-sm">
        <li v-for="category in categories" :key="category.id" class="flex items-center justify-between gap-3 border border-panel-border px-3 py-2">
          <input
            v-if="editingId === category.id"
            v-model="editingName"
            class="min-w-0 flex-1 border border-panel-border bg-panel px-2 py-1"
            aria-label="Edit category name"
            maxlength="200"
            required
            autofocus
            @keydown.enter.prevent="saveCategoryName(category)"
            @keydown.escape="cancelEdit"
          />
          <span v-else class="min-w-0">{{ category.name }} <span class="mono-meta">{{ category.isActive ? 'active' : 'inactive' }}</span></span>
          <span class="flex shrink-0 items-center gap-3">
            <button v-if="editingId === category.id" class="text-xs underline" type="button" :disabled="savingId === category.id" @click="saveCategoryName(category)">Save</button>
            <button v-if="editingId === category.id" class="text-xs underline" type="button" @click="cancelEdit">Cancel</button>
            <button v-else class="text-xs underline" type="button" @click="startEdit(category)">Edit</button>
            <button class="text-xs underline" type="button" @click="toggleCategory(category)">{{ category.isActive ? 'Deactivate' : 'Activate' }}</button>
          </span>
        </li>
      </ul>
    </section>
    <section>
      <h2 class="mb-3 font-semibold">Relationship types</h2>
      <form class="mb-3 flex flex-wrap gap-2" @submit.prevent="addType">
        <input v-model="typeName" class="border border-panel-border bg-panel px-2 py-1" placeholder="Name" aria-label="Relationship type name" required />
        <input v-model="typeCategory" class="border border-panel-border bg-panel px-2 py-1" placeholder="Category" aria-label="Relationship type category" required />
        <input v-model="typeDescription" class="min-w-64 border border-panel-border bg-panel px-2 py-1" placeholder="Description" aria-label="Relationship type description" required />
        <button class="bg-accent px-3 py-1 text-sm text-accent-fg" type="submit">Add type</button>
      </form>
      <ul class="space-y-2 text-sm">
        <li v-for="type in types" :key="type.id" class="border border-panel-border px-3 py-2">{{ type.name }} · {{ type.category }}</li>
      </ul>
    </section>
    <section>
      <h2 class="mb-3 font-semibold">Group roles</h2>
      <form class="mb-3 flex flex-wrap gap-2" @submit.prevent="addRole">
        <input v-model="roleName" class="border border-panel-border bg-panel px-2 py-1" placeholder="Role name" aria-label="Role name" required />
        <input v-model="roleDescription" class="min-w-64 border border-panel-border bg-panel px-2 py-1" placeholder="Description" aria-label="Role description" required />
        <button class="bg-accent px-3 py-1 text-sm text-accent-fg" type="submit">Add role</button>
      </form>
      <ul class="space-y-2 text-sm">
        <li v-for="role in roles" :key="role.id" class="border border-panel-border px-3 py-2">{{ role.name }} — {{ role.description }}</li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'

const { $api } = useNuxtApp()
const toasts = useToastStore()
const categories = ref<Awaited<ReturnType<typeof $api.traits.categories>>>([])
const types = ref<Awaited<ReturnType<typeof $api.relationships.types>>>([])
const roles = ref<Awaited<ReturnType<typeof $api.groups.roles>>>([])
const categoryName = ref('')
const categoryDescription = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const savingId = ref<string | null>(null)
const typeName = ref('')
const typeCategory = ref('')
const typeDescription = ref('')
const roleName = ref('')
const roleDescription = ref('')

async function load() {
  ;[categories.value, types.value, roles.value] = await Promise.all([
    $api.traits.categories(),
    $api.relationships.types(),
    $api.groups.roles()
  ])
}

async function addCategory() {
  try {
    await $api.admin.createCategory({ name: categoryName.value, description: categoryDescription.value })
    categoryName.value = ''
    categoryDescription.value = ''
    toasts.push('Category created.', 'success')
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

function startEdit(category: (typeof categories.value)[number]) {
  editingId.value = category.id
  editingName.value = category.name
}

function cancelEdit() {
  editingId.value = null
  editingName.value = ''
}

async function saveCategoryName(category: (typeof categories.value)[number]) {
  const name = editingName.value.trim()
  if (!name) {
    toasts.push('Category name is required.', 'error')
    return
  }
  if (name === category.name) {
    cancelEdit()
    return
  }
  savingId.value = category.id
  try {
    await $api.admin.patchCategory(category.id, { name })
    cancelEdit()
    toasts.push('Category updated.', 'success')
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  } finally {
    savingId.value = null
  }
}

async function toggleCategory(category: (typeof categories.value)[number]) {
  try {
    await $api.admin.patchCategory(category.id, { isActive: !category.isActive })
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

async function addType() {
  try {
    await $api.admin.createRelationshipType({ name: typeName.value, description: typeDescription.value, category: typeCategory.value })
    typeName.value = ''
    typeCategory.value = ''
    typeDescription.value = ''
    toasts.push('Relationship type created.', 'success')
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

async function addRole() {
  try {
    await $api.admin.createGroupRole({ name: roleName.value, description: roleDescription.value })
    roleName.value = ''
    roleDescription.value = ''
    toasts.push('Role created.', 'success')
    await load()
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}

onMounted(load)
</script>
