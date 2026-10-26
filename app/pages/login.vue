<template>
  <div class="w-full max-w-md border border-panel-border bg-panel p-6 shadow-panel">
    <p class="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">School account</p>
    <h1 class="mt-2 text-2xl font-semibold">Book Of Warnings</h1>
    <p class="mt-2 text-sm text-ink-400">Sign in with your school email, or leave both fields blank to continue as an anonymous member. An anonymous session can use the directory the same way a regular member can. It cannot open administration.</p>
    <p v-if="expired" class="mt-3 border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">Session expired. Sign in again. Route guards are interface-only.</p>
    <p v-if="institutionalError" class="mt-3 border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-200">School account sign-in was not accepted. The server did not open a session.</p>
    <a v-if="oidc" class="mt-6 block border border-panel-border px-3 py-2 text-center text-sm" :href="oidcHref">Sign in with your school account</a>
    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <div>
        <label class="mb-1 block text-sm" for="email">School email</label>
        <input id="email" v-model="email" class="w-full border border-panel-border bg-ink-950 px-3 py-2" type="email" autocomplete="username" />
        <p v-if="fieldErrors.email" class="mt-1 text-xs text-red-300">{{ fieldErrors.email }}</p>
      </div>
      <div>
        <label class="mb-1 block text-sm" for="password">Password</label>
        <input id="password" v-model="password" class="w-full border border-panel-border bg-ink-950 px-3 py-2" type="password" autocomplete="current-password" />
        <p v-if="fieldErrors.password" class="mt-1 text-xs text-red-300">{{ fieldErrors.password }}</p>
      </div>
      <p v-if="error" class="text-sm text-red-300">{{ error }}</p>
      <button class="w-full bg-accent py-2 text-sm font-medium text-accent-fg" type="submit" :disabled="busy">Sign in</button>
      <button class="w-full border border-panel-border py-2 text-sm" type="button" :disabled="busy" @click="enterAnonymous">Continue as anonymous</button>
    </form>
    <p class="mt-6 border-t border-panel-border pt-4 text-xs text-ink-400">Email addresses must use @{{ domain }}. Account matching comes from the roster or an administrator correction, not from display names.</p>
  </div>
</template>

<script setup lang="ts">
import { withApiBase } from '../../lib/utils/api-url'
import { isApiError } from '../../lib/types/errors'

definePageMeta({ layout: 'auth' })

const auth = useAuthStore()
const config = useRuntimeConfig()
const route = useRoute()
const domain = String(config.public.schoolEmailDomain)
const expired = computed(() => route.query.expired === '1')
const institutionalError = computed(() => route.query.error === 'institutional')
const oidc = ref(false)
const nextPath = computed(() => typeof route.query.next === 'string' ? route.query.next : '/')
const oidcHref = computed(() => withApiBase(
  String(config.public.apiBaseUrl ?? ''),
  `/api/auth/oidc/start?next=${encodeURIComponent(nextPath.value)}`
))
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const fieldErrors = ref<Record<string, string>>({})

onMounted(async () => {
  try {
    const { $api } = useNuxtApp()
    oidc.value = (await $api.auth.providers()).oidc
  } catch {
    oidc.value = false
  }
})

async function enterAnonymous() {
  email.value = ''
  password.value = ''
  await submit()
}

async function submit() {
  busy.value = true
  error.value = ''
  fieldErrors.value = {}
  const emailValue = email.value.trim()
  const passwordValue = password.value
  const anonymous = emailValue === '' && passwordValue.trim() === ''
  try {
    await auth.login(anonymous ? '' : emailValue, anonymous ? '' : passwordValue)
    await navigateTo(typeof route.query.next === 'string' ? route.query.next : '/')
  } catch (err) {
    if (isApiError(err)) {
      error.value = err.message
      fieldErrors.value = Object.fromEntries(Object.entries(err.fieldErrors).map(([key, value]) => [key, value[0] ?? '']))
    } else {
      error.value = 'Sign-in failed.'
    }
  } finally {
    busy.value = false
  }
}
</script>
