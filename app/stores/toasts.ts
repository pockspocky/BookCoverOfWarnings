export interface ToastItem {
  id: number
  tone: 'info' | 'error' | 'success'
  message: string
}

export const useToastStore = defineStore('toasts', () => {
  const items = ref<ToastItem[]>([])
  let seq = 1

  function push(message: string, tone: ToastItem['tone'] = 'info') {
    const id = seq++
    items.value.push({ id, tone, message })
    setTimeout(() => dismiss(id), 5200)
  }

  function dismiss(id: number) {
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, push, dismiss }
})
