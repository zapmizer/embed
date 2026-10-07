<script setup lang="ts">
import { defaultMessages } from '@zapmizer/embed/errors'
import type { EmbedState } from '@zapmizer/embed/state'
import { CHECKOUT_URL, RECONNECT_URL } from '../shared/render'

defineProps<{ state: Extract<EmbedState, { status: 'error' }> }>()
defineEmits<{ retry: [] }>()

const reload = (): void => window.location.reload()
</script>

<template>
  <div role="alert">
    <p>{{ defaultMessages[state.code] ?? 'Não foi possível abrir. Avise o suporte.' }}</p>
    <button v-if="state.action === 'retry'" type="button" @click="$emit('retry')">Tentar de novo</button>
    <button v-else-if="state.action === 'reload'" type="button" @click="reload">Recarregar a página</button>
    <a v-else-if="state.action === 'reconnect'" :href="RECONNECT_URL">Reconectar o WhatsApp</a>
    <a v-else-if="state.action === 'checkout'" :href="CHECKOUT_URL">Assinar</a>
  </div>
</template>
