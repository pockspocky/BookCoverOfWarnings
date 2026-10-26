export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuthStore()
  if (!auth.user && !auth.loading) {
    await auth.load()
  }
  if (to.path === '/login') {
    if (auth.isAuthenticated) return navigateTo('/')
    return
  }
  if (!auth.isAuthenticated) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`)
  }
  if (to.path.startsWith('/admin') && !auth.isAdmin) {
    return navigateTo('/forbidden')
  }
})
