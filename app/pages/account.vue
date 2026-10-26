<template>
  <div>
    <PageHeader title="Account" kicker="Session" description="Permission labels are hints. The API checks every action again, including private-profile access." />
    <p v-if="auth.isAnonymous" class="mb-4 max-w-2xl text-sm text-ink-400">This session is an anonymous member. It can browse the directory, search, the graph, and submissions the same way a regular member can. Administration stays closed, and there is no matched private profile.</p>
    <SkeletonBlock v-if="!auth.user" />
    <dl v-else class="grid max-w-2xl gap-4 border border-panel-border bg-panel p-4 text-sm md:grid-cols-2">
      <div><dt class="mono-meta">Email</dt><dd>{{ auth.isAnonymous ? 'Anonymous' : auth.user.account.email }}</dd></div>
      <div><dt class="mono-meta">Role</dt><dd>{{ auth.user.account.role }}</dd></div>
      <div><dt class="mono-meta">Email verified</dt><dd>{{ auth.user.account.emailVerified ? 'yes' : 'no' }}</dd></div>
      <div><dt class="mono-meta">Match status</dt><dd><StatusBadge :label="auth.user.account.matchStatus" /></dd></div>
      <div class="md:col-span-2">
        <dt class="mono-meta">Matched student</dt>
        <dd v-if="auth.user.matchedStudent">
          <NuxtLink :to="`/students/${auth.user.matchedStudent.id}`" class="text-accent">{{ auth.user.matchedStudent.displayName }}</NuxtLink>
          <span class="mono-meta ml-2">{{ auth.user.matchedStudent.id }}</span>
        </dd>
        <dd v-else>No verified profile match. Display-name similarity is not used.</dd>
      </div>
      <div class="md:col-span-2">
        <dt class="mono-meta">Permissions returned by the server</dt>
        <dd class="font-mono text-xs">{{ auth.user.permissions.join(', ') }}</dd>
      </div>
    </dl>
    <div class="mt-4 flex gap-2">
      <NuxtLink v-if="auth.matchedStudentId" to="/me/private-profile" class="border border-accent px-3 py-1.5 text-sm text-accent">Private profile</NuxtLink>
      <button class="border border-panel-border px-3 py-1.5 text-sm" type="button" @click="signOut">Sign out</button>
    </div>
  </div>
</template>

<script setup lang="ts">
const auth = useAuthStore()

async function signOut() {
  await auth.logout()
  await navigateTo('/login')
}
</script>
