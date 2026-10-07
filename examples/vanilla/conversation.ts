import { createConversation } from '@zapmizer/embed/conversation'
import { BRAND, fillFrame, renderState } from '../shared/render'
import { sessionFrom } from '../shared/session'

// <div class="conversa" style="position: relative">
//   <div class="conversa-iframe"></div>
//   <div class="conversa-estado" style="position: absolute; inset: 0"></div>
// </div>
export function mountConversation(wrapper: HTMLElement, customerId: number): () => void {
  const frameContainer = wrapper.querySelector<HTMLElement>('.conversa-iframe')
  const status = wrapper.querySelector<HTMLElement>('.conversa-estado')

  if (frameContainer === null || status === null) {
    throw new Error('Faltam .conversa-iframe e .conversa-estado dentro do wrapper.')
  }

  wrapper.style.height = '480px'

  const theme = window.matchMedia('(prefers-color-scheme: dark)')
  const conversation = createConversation({
    container: frameContainer,
    brand: BRAND,
    openSession: sessionFrom(`/customers/${customerId}/zapmizer-embed-session`, () => ({ theme: theme.matches ? 'dark' : 'light' })),
    frame: { configure: fillFrame },
    onState: (state) => renderState(status, state, () => conversation.retry()),
    onResize: (height) => (wrapper.style.height = `${Math.min(800, Math.max(320, height))}px`),
    onMessageSent: (messageId) => console.info('mensagem enviada pelo atendente', messageId),
  })

  // A troca de tema pede uma sessão nova sobre o iframe velho.
  const onTheme = (): void => conversation.reopen()

  theme.addEventListener('change', onTheme)

  return () => {
    theme.removeEventListener('change', onTheme)
    conversation.destroy()
  }
}
