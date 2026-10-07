import { defaultMessages } from '@zapmizer/embed/errors'
import type { EmbedState } from '@zapmizer/embed/state'

export const BRAND = 'zapmizer'

export const RECONNECT_URL = '/integracoes/zapmizer/reconectar'

export const CHECKOUT_URL = '/assinatura'

export function fillFrame(iframe: HTMLIFrameElement): void {
  Object.assign(iframe.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' })
}

// Desenha carregando e erro dentro de `target`, que fica por cima do iframe. Em `ready` e `closed` ele some.
export function renderState(target: HTMLElement, state: EmbedState, retry: () => void): void {
  target.replaceChildren()
  target.hidden = state.status === 'ready' || state.status === 'closed'

  if (state.status === 'opening' || state.status === 'loading') {
    target.append(paragraph('Carregando…'))
  }

  if (state.status !== 'error') {
    return
  }

  target.append(paragraph(defaultMessages[state.code] ?? 'Não foi possível abrir. Avise o suporte.'))

  if (state.action === 'retry') {
    target.append(button('Tentar de novo', retry))
  } else if (state.action === 'reload') {
    target.append(button('Recarregar a página', () => window.location.reload()))
  } else if (state.action === 'reconnect') {
    target.append(link('Reconectar o WhatsApp', RECONNECT_URL))
  } else if (state.action === 'checkout') {
    target.append(link('Assinar', CHECKOUT_URL))
  }
}

function paragraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p')

  element.textContent = text

  return element
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')

  element.type = 'button'
  element.textContent = text
  element.addEventListener('click', onClick)

  return element
}

function link(text: string, href: string): HTMLAnchorElement {
  const element = document.createElement('a')

  element.href = href
  element.textContent = text

  return element
}
