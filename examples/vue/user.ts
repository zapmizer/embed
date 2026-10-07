import { computed, ref } from 'vue'

// O que o app já sabe de quem está logado. Aqui é um ref; no app real vem da store, das props da página etc.
export const currentUser = ref<{ id: number; teamId: number } | null>(null)

export const inboxAvailable = ref(false)

export const person = computed(() => (currentUser.value === null ? null : `${currentUser.value.id}:${currentUser.value.teamId}`))
