import { toRefusal } from './errors'
import { parseEmbedMessage } from './messages'
import type { EmbedMessage } from './messages'
import { webOriginOf } from './resume'
import type { Clock, FrameOptions, OpenSession, SessionOpened, SessionRefused } from './state'

const CONVERSATION_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation'

export const CONVERSATION_FRAME: FrameKind = { allow: 'clipboard-write', sandbox: CONVERSATION_SANDBOX, title: 'Conversa no WhatsApp' }

export const INBOX_FRAME: FrameKind = { allow: 'clipboard-write; microphone; fullscreen; autoplay', sandbox: `${CONVERSATION_SANDBOX} allow-modals`, title: 'Caixa de entrada do WhatsApp' }

export const defaultClock: Clock = {
  now: () => Date.now(),
  after: (ms, callback) => {
    const handle = setTimeout(callback, ms)

    return () => clearTimeout(handle)
  },
  every: (ms, callback) => {
    const handle = setInterval(callback, ms)

    return () => clearInterval(handle)
  },
}

export function isolated(callback: () => void): void {
  try {
    callback()
  } catch (error) {
    queueMicrotask(() => {
      throw error
    })
  }
}

export function serialDispatcher<E>(handle: (event: E) => void): (event: E) => void {
  const queue: E[] = []
  let running = false

  return (event) => {
    queue.push(event)

    if (running) {
      return
    }

    running = true

    try {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        handle(next)
      }
    } finally {
      running = false
      queue.length = 0
    }
  }
}

export function isUsableSession(session: unknown): session is SessionOpened {
  if (typeof session !== 'object' || session === null || !('url' in session) || !('origin' in session)) {
    return false
  }

  return typeof session.url === 'string' && typeof session.origin === 'string' && webOriginOf(session.url) === session.origin
}

export function requestSession(openSession: OpenSession, onOpened: (session: SessionOpened) => void, onRefused: (refusal: SessionRefused) => void): void {
  let pending: Promise<SessionOpened>

  try {
    pending = Promise.resolve(openSession())
  } catch (error) {
    pending = Promise.reject(error)
  }

  pending.then(
    (session) => (isUsableSession(session) ? onOpened(session) : onRefused({ status: null, code: null })),
    (error: unknown) => onRefused(toRefusal(error)),
  )
}

export function createFrameSlot(options: FrameSlotOptions): FrameSlot {
  let iframe: HTMLIFrameElement | null = null
  let origin: string | null = null

  function listener(event: MessageEvent): void {
    if (iframe === null || origin === null) {
      return
    }

    const message = parseEmbedMessage(event, { brand: options.brand, origin, frame: iframe.contentWindow })

    if (message !== null) {
      options.onMessage(message)
    }
  }

  function unmount(): void {
    iframe?.remove()
    iframe = null
    origin = null
  }

  function mount(url: string, nextOrigin: string): void {
    unmount()

    const element = document.createElement('iframe')

    element.setAttribute('src', url)
    element.setAttribute('allow', options.kind.allow)
    element.setAttribute('sandbox', options.kind.sandbox)
    element.setAttribute('title', options.frame?.title ?? options.kind.title)
    options.frame?.configure?.(element)
    options.container.appendChild(element)
    iframe = element
    origin = nextOrigin
  }

  function stop(): void {
    window.removeEventListener('message', listener)
    unmount()
  }

  window.addEventListener('message', listener)

  return { mount, unmount, stop }
}

export type FrameKind = { allow: string; sandbox: string; title: string }

export type FrameSlot = { mount(url: string, origin: string): void; unmount(): void; stop(): void }

type FrameSlotOptions = {
  container: HTMLElement
  brand: string
  kind: FrameKind
  frame: FrameOptions | undefined
  onMessage: (message: EmbedMessage) => void
}
