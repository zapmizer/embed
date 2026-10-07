<script setup lang="ts">
import { computed } from 'vue'
import { EmbedConversation } from '@zapmizer/embed/vue'
import EmbedError from './EmbedError.vue'
import { clamp, conversationSession, frame } from './conversation'

const props = defineProps<{ customerId: number; theme: 'light' | 'dark' }>()
const emit = defineEmits<{ 'message-sent': [messageId: string | number] }>()

const openSession = computed(() => conversationSession(props.customerId, props.theme))
</script>

<template>
  <!-- O `key` remonta a conversa quando o cliente ou o tema mudam: brand, frame e readyTimeoutMs só são lidos na montagem. -->
  <div style="position: relative">
    <EmbedConversation :key="`${customerId}:${theme}`" brand="zapmizer" :open-session="openSession" :frame="frame" @message-sent="emit('message-sent', $event)">
      <template #default="{ state, retry, height }">
        <div :style="{ height: clamp(height) }" />
        <p v-if="state.status === 'opening' || state.status === 'loading'" style="position: absolute; inset: 0">Carregando…</p>
        <EmbedError v-else-if="state.status === 'error'" :state="state" style="position: absolute; inset: 0" @retry="retry" />
      </template>
    </EmbedConversation>
  </div>
</template>
