import { afterEach, beforeEach, expect, it } from 'bun:test'
import { mountConversation } from './conversation'

const ORIGIN = 'https://app.zapmizer.com'
const realFetch = globalThis.fetch
let wrapper: HTMLElement
let destroy: () => void

// O backend do app, falso: a primeira resposta da fila responde ao próximo POST.
let replies: Response[]

function reply(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

// O iframe fala por postMessage. No teste, a mensagem sai do contentWindow dele, com a origem da sessão.
function fromIframe(data: Record<string, unknown>): void {
  const iframe = wrapper.querySelector('iframe')

  window.dispatchEvent(new MessageEvent('message', { origin: ORIGIN, source: iframe?.contentWindow ?? null, data: { source: 'zapmizer-embed', ...data } }))
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  replies = []
  globalThis.fetch = (async () => replies.shift() ?? reply(503, { code: 'unavailable' })) as unknown as typeof fetch
  wrapper = document.body.appendChild(document.createElement('div'))
  wrapper.innerHTML = '<div class="conversa-iframe"></div><div class="conversa-estado"></div>'
})

afterEach(() => {
  destroy()
  globalThis.fetch = realFetch
  document.body.innerHTML = ''
})

it('shows the conversation and follows its height', async () => {
  replies.push(reply(200, { url: `${ORIGIN}/embed/start/abc`, origin: ORIGIN }))
  destroy = mountConversation(wrapper, 42)
  await settle()

  fromIframe({ type: 'ready' })
  fromIframe({ type: 'resize', height: 1200 })

  expect(wrapper.querySelector('iframe')?.getAttribute('src')).toBe(`${ORIGIN}/embed/start/abc`)
  expect(wrapper.querySelector<HTMLElement>('.conversa-estado')?.hidden).toBe(true)
  expect(wrapper.style.height).toBe('800px')
})

it('offers to reconnect when the backend answers reauth_required', async () => {
  replies.push(reply(422, { code: 'reauth_required' }))
  destroy = mountConversation(wrapper, 42)
  await settle()

  expect(wrapper.querySelector('iframe')).toBeNull()
  expect(wrapper.querySelector('.conversa-estado a')?.textContent).toBe('Reconectar o WhatsApp')
})

it('asks for a reload when the app session is gone', async () => {
  replies.push(reply(419, { message: 'CSRF token mismatch.' }))
  destroy = mountConversation(wrapper, 42)
  await settle()

  expect(wrapper.querySelector('.conversa-estado button')?.textContent).toBe('Recarregar a página')
})
