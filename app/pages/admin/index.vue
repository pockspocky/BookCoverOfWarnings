<template>
  <div>
    <PageHeader title="Administration" kicker="Moderation" description="Approval publishes a revision. Rejection deletes the submitted content and does not keep a content archive. Client checks are not sufficient for production." />
    <SkeletonBlock v-if="pending" />
    <div v-else class="grid gap-3 md:grid-cols-3">
      <NuxtLink v-for="card in cards" :key="card.to" :to="card.to" class="border border-panel-border bg-panel p-4 hover:border-accent">
        <p class="mono-meta uppercase">{{ card.label }}</p>
        <p class="mt-2 text-3xl font-semibold">{{ card.value }}</p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const { $api } = useNuxtApp()
const pending = ref(true)
const queue = ref(0)
const accounts = ref(0)

const cards = computed(() => [
  { label: 'Pending queue', value: queue.value, to: '/admin/submissions' },
  { label: 'Accounts', value: accounts.value, to: '/admin/profile-matching' }
])

onMounted(async () => {
  const [submissionPage, accountPage] = await Promise.all([
    $api.admin.submissions({ pageSize: 1 }),
    $api.admin.accounts()
  ])
  queue.value = submissionPage.meta.total
  accounts.value = accountPage.meta.total
  pending.value = false
})
</script>
