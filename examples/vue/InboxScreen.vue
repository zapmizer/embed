<script setup lang="ts">
import { inject } from 'vue'
import { useInboxSlot } from '@zapmizer/embed/vue'
import EmbedError from './EmbedError.vue'
import { INBOX } from './inbox'
import { inboxAvailable, person } from './user'

const inbox = inject(INBOX)!
const slot = useInboxSlot(inbox.host, { person, enabled: inboxAvailable })
</script>

<template>
  <section ref="slot" style="height: 100%" />
  <Teleport :to="inbox.host.overlay">
    <p v-if="inbox.state.value.status === 'opening' || inbox.state.value.status === 'loading'" style="pointer-events: auto">Carregando…</p>
    <EmbedError v-else-if="inbox.state.value.status === 'error'" :state="inbox.state.value" style="pointer-events: auto" @retry="inbox.retry" />
  </Teleport>
</template>
