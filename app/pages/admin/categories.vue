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
        <li v-for="category in categories" :key="category.id" class="flex items-center justify-between border border-panel-border px-3 py-2">
          <span>{{ category.name }} <span class="mono-meta">{{ category.isActive ? 'active' : 'inactive' }}</span></span>
          <button class="text-xs underline" type="button" @click="toggleCategory(category)">{{ category.isActive ? 'Deactivate' : 'Activate' }}</button>
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
