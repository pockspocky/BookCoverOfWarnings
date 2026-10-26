<template>
  <div class="min-h-screen bg-ink-950 text-ink-100 light:bg-ink-50 light:text-ink-900">
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">Skip to content</a>
    <div class="flex min-h-screen">
      <aside class="hidden w-60 shrink-0 border-r border-panel-border bg-ink-900/80 md:block">
        <div class="border-b border-panel-border px-4 py-4">
          <NuxtLink to="/" class="block">
            <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Registry</p>
            <p class="text-lg font-semibold">Book Of Warnings</p>
          </NuxtLink>
        </div>
        <nav class="flex flex-col gap-0.5 p-2 text-sm">
          <NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="rounded px-3 py-2 text-ink-300 hover:bg-ink-800 hover:text-ink-50" active-class="bg-ink-800 text-accent">
            {{ item.label }}
          </NuxtLink>
          <NuxtLink v-if="auth.isAdmin" to="/admin" class="rounded px-3 py-2 text-ink-300 hover:bg-ink-800" active-class="bg-ink-800 text-accent">Administration</NuxtLink>
        </nav>
      </aside>
      <div class="flex min-w-0 flex-1 flex-col">
        <header class="flex items-center justify-between gap-3 border-b border-panel-border bg-ink-900/60 px-4 py-3">
          <form class="flex min-w-0 flex-1 max-w-xl" @submit.prevent="goSearch">
            <label class="sr-only" for="global-search">Search</label>
            <input id="global-search" v-model="q" class="w-full border border-panel-border bg-ink-950 px-3 py-2 text-sm" placeholder="Search students, groups, traits…" />
          </form>
          <div class="flex items-center gap-2">
            <button data-testid="theme-toggle" class="border border-panel-border px-2 py-1 text-xs" type="button" @click="theme.toggle()">{{ theme.mode === 'dark' ? 'Light' : 'Dark' }}</button>
            <NuxtLink to="/account" class="font-mono text-xs text-ink-300">{{ auth.isAnonymous ? 'Anonymous' : auth.user?.account.email }}</NuxtLink>
            <button class="border border-panel-border px-2 py-1 text-xs" type="button" @click="onLogout">Sign out</button>
          </div>
        </header>
        <nav class="flex gap-2 overflow-auto border-b border-panel-border px-4 py-2 text-sm md:hidden">
          <NuxtLink v-for="item in links" :key="item.to" :to="item.to" class="whitespace-nowrap text-ink-300">{{ item.label }}</NuxtLink>
        </nav>
        <main id="main" class="flex-1 p-6">
          <slot />
        </main>
      </div>
    </div>
    <AppToasts />
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore()
const theme = useThemeStore()
const router = useRouter()
const q = ref('')
const links = computed(() => [
  { to: '/', label: 'Dashboard' },
  { to: '/students', label: 'Students' },
  { to: '/groups', label: 'Groups' },
  { to: '/traits', label: 'Traits' },
  { to: '/evidence', label: 'Evidence' },
  { to: '/relationships', label: 'Relationships' },
  { to: '/graph', label: 'Graph' },
  { to: '/search', label: 'Advanced search' },
  { to: '/me/submissions', label: 'My submissions' },
  ...(auth.matchedStudentId ? [{ to: '/me/private-profile', label: 'Private profile' }] : [])
])

function goSearch() {
  router.push({ path: '/search', query: { q: q.value } })
}

async function onLogout() {
  await auth.logout()
  await navigateTo('/login')
}
</script>
