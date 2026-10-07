export const PARLI = 'http://parli.test'

export const BRAND = 'parli'

export function appendFrame(parent: HTMLElement = document.body): HTMLIFrameElement {
  const iframe = document.createElement('iframe')

  parent.appendChild(iframe)

  return iframe
}

export function messageFrom(source: Window | null, data: unknown, origin: string = PARLI): MessageEvent {
  return new MessageEvent('message', { origin, source, data })
}

export function postFrom(iframe: HTMLIFrameElement | null, data: Record<string, unknown>, origin: string = PARLI): void {
  window.dispatchEvent(messageFrom(iframe?.contentWindow ?? null, { source: `${BRAND}-embed`, ...data }, origin))
}

export function framesIn(container: HTMLElement): HTMLIFrameElement[] {
  return [...container.querySelectorAll('iframe')]
}

export function onlyFrame(container: HTMLElement): HTMLIFrameElement | null {
  return container.querySelector('iframe')
}
