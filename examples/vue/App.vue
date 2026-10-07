<script setup lang="ts">
import { RouterView } from 'vue-router'
import { provideInbox } from './inbox'

// O host nasce aqui e sobrevive à navegação. Ele fecha sozinho quando `person` muda ou `inboxAvailable` vira false,
// mesmo com o usuário em outra tela.
provideInbox()
</script>

<template>
  <RouterView />
</template>
