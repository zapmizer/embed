import { afterEach, describe, expect, it } from 'bun:test'
import type { EmbedState } from '../src/state'

describe('test environment', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('gives every iframe its own window without hitting the network', () => {
    const first = document.body.appendChild(document.createElement('iframe'))
    const second = document.body.appendChild(document.createElement('iframe'))

    first.setAttribute('src', 'http://parli.test/embed/abc')

    expect(first.contentWindow).not.toBeNull()
    expect(first.contentWindow).not.toBe(second.contentWindow)
  })

  it('delivers a synthetic postMessage with origin and source', () => {
    const iframe = document.body.appendChild(document.createElement('iframe'))
    const received: Array<{ origin: string; fromIframe: boolean; data: unknown }> = []
    const listener = (event: MessageEvent): void => {
      received.push({ origin: event.origin, fromIframe: event.source === iframe.contentWindow, data: event.data })
    }

    window.addEventListener('message', listener)
    window.dispatchEvent(new MessageEvent('message', { origin: 'http://parli.test', source: iframe.contentWindow, data: { type: 'ready' } }))
    window.removeEventListener('message', listener)

    expect(received).toEqual([{ origin: 'http://parli.test', fromIframe: true, data: { type: 'ready' } }])
  })

  it('has sessionStorage, BroadcastChannel and ResizeObserver', () => {
    expect(typeof window.sessionStorage.getItem).toBe('function')
    expect(typeof BroadcastChannel).toBe('function')
    expect(typeof ResizeObserver).toBe('function')
  })

  it('compiles the public state type', () => {
    const state: EmbedState = { status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' }

    expect(state.status).toBe('error')
  })
})
