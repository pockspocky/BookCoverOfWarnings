export default defineNuxtRouteMiddleware(async (to) => {
  const publicRoutes = ['/login', '/forbidden']
  const auth = useAuthStore()
  if (!auth.user && !auth.loading) {
    await auth.load()
  }
  if (to.path === '/login') {
    if (auth.isAuthenticated) return navigateTo('/')
    return
  }
  if (publicRoutes.includes(to.path)) return
  if (!auth.isAuthenticated) {
    const next = encodeURIComponent(to.fullPath)
    return navigateTo(`/login?next=${next}`)
  }
  if (to.path.startsWith('/admin') && !auth.isAdmin) {
    return navigateTo('/forbidden')
  }
})
