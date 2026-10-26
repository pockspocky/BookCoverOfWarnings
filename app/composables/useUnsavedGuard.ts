export function useUnsavedGuard(isDirty: Ref<boolean>) {
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!isDirty.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload))

  onBeforeRouteLeave(() => {
    if (!isDirty.value) return true
    return window.confirm('You have unsaved changes. Leave this page without saving?')
  })
}
