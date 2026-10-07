import { createInboxHost } from '@zapmizer/embed/host'
import type { InboxHost } from '@zapmizer/embed/host'
import { BRAND, fillFrame, renderState } from '../shared/render'
import { keepAliveAt, sessionFrom } from '../shared/session'

// SPA sem framework (ou um framework legado, como AngularJS): crie o host uma vez, no boot do app.
export function createAppInbox(): InboxHost {
  const host: InboxHost = createInboxHost({
    brand: BRAND,
    openSession: sessionFrom('/atendimento/zapmizer-embed-session'),
    keepAlive: keepAliveAt('/atendimento/keepalive'),
    frame: { configure: fillFrame },
    onState: (state) => renderState(host.overlay, state, () => host.retry()),
  })

  Object.assign(host.overlay.style, { position: 'absolute', inset: '0' })
  host.element.style.zIndex = '5'
  host.element.setAttribute('role', 'region')
  host.element.setAttribute('aria-label', 'Caixa de entrada do WhatsApp')

  return host
}

// Na tela de atendimento: ao entrar, prenda o host ao slot; ao sair, solte.
// O slot é qualquer elemento que reserva o espaço da caixa, por exemplo <section class="caixa" style="height: 100%">.
export function enterInboxScreen(host: InboxHost, slot: HTMLElement, person: string | null): () => void {
  host.attach(slot, person)

  return () => host.detach(slot)
}

// Troca de time ou de usuário fora da tela de atendimento: feche o host. A próxima visita abre para a pessoa nova.
export function onPersonChanged(host: InboxHost, person: string | null): void {
  if (person !== host.person) {
    host.close()
  }
}
