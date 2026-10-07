import { provide } from 'vue'
import type { InjectionKey } from 'vue'
import { useInboxHost } from '@zapmizer/embed/vue'
import type { UseInboxHost } from '@zapmizer/embed/vue'
import { BRAND, fillFrame } from '../shared/render'
import { keepAliveAt, sessionFrom } from '../shared/session'
import { inboxAvailable, person } from './user'

export const INBOX: InjectionKey<UseInboxHost> = Symbol('inbox')

// Chamado uma vez, no setup do componente raiz.
export function provideInbox(): UseInboxHost {
  const inbox = useInboxHost({
    brand: BRAND,
    openSession: sessionFrom('/atendimento/zapmizer-embed-session'),
    keepAlive: keepAliveAt('/atendimento/keepalive'),
    person,
    enabled: inboxAvailable,
    frame: { configure: fillFrame },
  })

  Object.assign(inbox.host.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  inbox.host.element.style.zIndex = '5'
  inbox.host.element.setAttribute('role', 'region')
  inbox.host.element.setAttribute('aria-label', 'Caixa de entrada do WhatsApp')

  provide(INBOX, inbox)

  return inbox
}
