<template>
  <div>
    <PageHeader title="Administrators" kicker="Admin" description="Add another administrator with a school email and a password of at least 12 characters. Existing accounts are not promoted. This page does not demote, delete, or reset passwords." />
    <form class="mb-6 grid max-w-xl gap-3 border border-panel-border bg-panel p-4" @submit.prevent="askCreate">
      <h2 class="font-semibold">Add an administrator</h2>
      <label class="text-sm" for="administrator-email">School email
        <input id="administrator-email" v-model="form.email" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="email" autocomplete="off" required />
      </label>
      <label class="text-sm" for="administrator-password">Password
        <input id="administrator-password" v-model="form.password" class="mt-1 w-full border border-panel-border bg-ink-950 px-2 py-1" type="password" autocomplete="new-password" minlength="12" required />
      </label>
      <p class="text-xs text-ink-400">The password is sent in the request body and is not placed in the address bar.</p>
      <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>
      <button class="w-fit bg-accent px-3 py-1.5 text-sm text-accent-fg" type="submit" :disabled="saving">Add administrator</button>
    </form>
    <SkeletonBlock v-if="pending" />
    <template v-else>
      <DataTable v-if="administrators.length" :columns="['Email', 'Role', 'Verified', 'Match']">
        <tr v-for="account in administrators" :key="account.id" class="border-b border-panel-border">
          <td class="px-3 py-2">{{ account.email }}</td>
          <td class="px-3 py-2">{{ account.role }}</td>
          <td class="px-3 py-2">{{ account.emailVerified ? 'yes' : 'no' }}</td>
          <td class="px-3 py-2">{{ account.matchStatus }}</td>
        </tr>
      </DataTable>
      <EmptyState v-else title="No administrators" description="Accounts with the administrator role appear here." />
    </template>
    <ConfirmDialog :open="confirmOpen" title="Create this administrator?" :message="confirmMessage" confirm-label="Create administrator" @cancel="confirmOpen = false" @confirm="createAdministrator" />
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { UserAccount } from '../../../lib/types'

const { $api } = useNuxtApp()
const toasts = useToastStore()
const pending = ref(true)
const saving = ref(false)
const confirmOpen = ref(false)
const formError = ref('')
const administrators = ref<UserAccount[]>([])
const form = reactive({ email: '', password: '' })
const dirty = computed(() => Boolean(form.email || form.password))
const confirmMessage = computed(() => `This creates an administrator for ${form.email.trim() || 'this email'}. The password is not shown again and is not added to the address bar.`)
useUnsavedGuard(dirty)

async function load() {
  try {
    const page = await $api.admin.accounts()
    administrators.value = page.data.filter((account) => account.role === 'administrator')
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  } finally {
    pending.value = false
  }
}

function askCreate() {
  formError.value = ''
  if (form.password.length < 12) {
    formError.value = 'password: Password must be at least 12 characters.'
    return
  }
  confirmOpen.value = true
}

async function createAdministrator() {
  if (saving.value) return
  saving.value = true
  formError.value = ''
  try {
    await $api.admin.createAdministrator({ email: form.email.trim(), password: form.password })
    form.email = ''
    form.password = ''
    confirmOpen.value = false
    toasts.push('Administrator created.', 'success')
    await load()
  } catch (err) {
    confirmOpen.value = false
    formError.value = errorMessage(err)
    toasts.push(errorMessage(err), 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>
