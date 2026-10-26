import { ANONYMOUS_ACCOUNT_EMAIL } from '../../lib/auth/anonymous'
import type { AuthUser } from '../../lib/types'

export const useAuthStore = defineStore('auth', () => {
  const { $api } = useNuxtApp()
  const user = ref<AuthUser | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(user.value))
  const isAnonymous = computed(() => user.value?.account.email === ANONYMOUS_ACCOUNT_EMAIL)
  const isAdmin = computed(() => user.value?.account.role === 'administrator')
  const matchedStudentId = computed(() => user.value?.account.matchedStudentId ?? null)

  async function load() {
    loading.value = true
    try {
      const session = await $api.auth.session()
      if (!session.authenticated) {
        user.value = null
        return
      }
      user.value = await $api.auth.me()
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string) {
    const result = await $api.auth.login({ email, password })
    user.value = result.data
    return result
  }

  async function logout() {
    await $api.auth.logout()
    user.value = null
  }

  async function refreshAfterMatchChange() {
    user.value = null
    await load()
  }

  return { user, loading, isAuthenticated, isAnonymous, isAdmin, matchedStudentId, load, login, logout, refreshAfterMatchChange }
})
