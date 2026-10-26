<template>
  <div>
    <PageHeader title="Private profile" kicker="Only you" description="This self-description is visible only to the matched student account. Administrators do not receive it. It is excluded from search, the graph, exports, and review screens." />
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Private profile unavailable" :description="error" />
    <form v-else class="max-w-xl space-y-4 border border-panel-border bg-panel p-4" @submit.prevent="save">
      <label class="block text-sm" for="preset">Self-description</label>
      <select id="preset" v-model="preset" class="w-full border border-panel-border bg-ink-950 px-3 py-2">
        <option :value="null">Not specified</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <label v-if="preset === 'other'" class="block text-sm" for="custom">Other / self-described
        <input id="custom" v-model="custom" class="mt-1 w-full border border-panel-border bg-ink-950 px-3 py-2" maxlength="200" required />
      </label>
      <p class="text-xs text-ink-400">Saved only to your private profile. Publishing this field is not offered.</p>
      <button class="bg-accent px-3 py-2 text-sm text-accent-fg" type="submit">Save private profile</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../../utils/errors'
import type { SexualityPreset } from '../../../lib/types'

const { $api } = useNuxtApp()
const toasts = useToastStore()
const pending = ref(true)
const error = ref('')
const preset = ref<SexualityPreset | null>(null)
const custom = ref('')
const baseline = ref('')
const dirty = computed(() => JSON.stringify({ preset: preset.value, custom: custom.value }) !== baseline.value)
useUnsavedGuard(dirty)

const options: Array<{ value: SexualityPreset; label: string }> = [
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
  { value: 'heterosexual', label: 'Heterosexual' },
  { value: 'gay', label: 'Gay' },
  { value: 'lesbian', label: 'Lesbian' },
  { value: 'bisexual', label: 'Bisexual' },
  { value: 'asexual', label: 'Asexual' },
  { value: 'questioning', label: 'Questioning' },
  { value: 'other', label: 'Other / self-described' }
]

onMounted(async () => {
  try {
    const profile = await $api.privateProfile.get()
    preset.value = profile.sexualityPreset
    custom.value = profile.sexualityCustom ?? ''
    baseline.value = JSON.stringify({ preset: preset.value, custom: custom.value })
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
})

async function save() {
  try {
    await $api.privateProfile.patch({
      sexualityPreset: preset.value,
      sexualityCustom: preset.value === 'other' ? custom.value : null
    })
    baseline.value = JSON.stringify({ preset: preset.value, custom: custom.value })
    toasts.push('Private profile saved. It remains unpublished.', 'success')
  } catch (err) {
    toasts.push(errorMessage(err), 'error')
  }
}
</script>
