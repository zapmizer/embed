import { createInbox } from '@zapmizer/embed/inbox'
import { BRAND, fillFrame, renderState } from '../shared/render'
import { keepAliveAt, sessionFrom } from '../shared/session'

// Página sem SPA: a caixa vive enquanto a página está aberta.
// <section class="caixa" style="position: relative; height: 100vh">
//   <div class="caixa-iframe"></div>
//   <div class="caixa-estado" style="position: absolute; inset: 0"></div>
// </section>
export function mountInbox(wrapper: HTMLElement, person: string | null): () => void {
  const frameContainer = wrapper.querySelector<HTMLElement>('.caixa-iframe')
  const status = wrapper.querySelector<HTMLElement>('.caixa-estado')

  if (frameContainer === null || status === null) {
    throw new Error('Faltam .caixa-iframe e .caixa-estado dentro do wrapper.')
  }

  const inbox = createInbox({
    container: frameContainer,
    brand: BRAND,
    person,
    openSession: sessionFrom('/atendimento/zapmizer-embed-session'),
    keepAlive: keepAliveAt('/atendimento/keepalive'),
    frame: { configure: fillFrame },
    onState: (state) => renderState(status, state, () => inbox.retry()),
  })

  return () => inbox.destroy()
}
