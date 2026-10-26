export const useThemeStore = defineStore('theme', () => {
  const mode = ref<'dark' | 'light'>('dark')

  function apply() {
    if (!import.meta.client) return
    document.documentElement.classList.toggle('dark', mode.value === 'dark')
    document.documentElement.classList.toggle('light', mode.value === 'light')
    localStorage.setItem('bow-theme', mode.value)
  }

  function hydrate() {
    if (!import.meta.client) return
    const stored = localStorage.getItem('bow-theme')
    if (stored === 'light' || stored === 'dark') mode.value = stored
    apply()
  }

  function toggle() {
    mode.value = mode.value === 'dark' ? 'light' : 'dark'
    apply()
  }

  return { mode, toggle, hydrate, apply }
})
