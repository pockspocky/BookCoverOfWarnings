export default defineNuxtPlugin(() => {
  const theme = useThemeStore()
  theme.hydrate()
})
