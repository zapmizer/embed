import { afterEach, describe, expect, it } from 'bun:test'
import { CONVERSATION_FRAME, INBOX_FRAME, createFrameSlot, isUsableSession, requestSession, serialDispatcher } from '../src/driver'
import type { EmbedMessage } from '../src/messages'
import type { SessionOpened, SessionRefused } from '../src/state'
import { BRAND, PARLI, framesIn, onlyFrame, postFrom } from './support/frames'
import { settle } from './support/sessions'

describe('serial dispatcher', () => {
  it('handles an event dispatched while handling another one after it', () => {
    const order: string[] = []
    const dispatch = serialDispatcher<string>((event) => {
      order.push(`start ${event}`)

      if (event === 'first') {
        dispatch('second')
      }

      order.push(`end ${event}`)
    })

    dispatch('first')

    expect(order).toEqual(['start first', 'end first', 'start second', 'end second'])
  })

  it('keeps working after a handler throws', () => {
    const handled: string[] = []
    const dispatch = serialDispatcher<string>((event) => {
      if (event === 'boom') {
        throw new Error('boom')
      }

      handled.push(event)
    })

    expect(() => dispatch('boom')).toThrow('boom')
    dispatch('after')

    expect(handled).toEqual(['after'])
  })
})

describe('usable session', () => {
  it('accepts an http(s) url on the given origin', () => {
    expect(isUsableSession({ url: `${PARLI}/embed/abc`, origin: PARLI })).toBe(true)
  })

  it.each([
    ['no url', { origin: PARLI }],
    ['no origin', { url: `${PARLI}/embed/abc` }],
    ['a url on another origin', { url: 'https://evil.test/embed/abc', origin: PARLI }],
    ['a javascript url', { url: 'javascript:alert(1)', origin: 'null' }],
    ['a relative url', { url: '/embed/abc', origin: PARLI }],
    ['nothing', null],
    ['a string', 'https://parli.test/embed/abc'],
  ])('refuses %s', (_, session) => {
    expect(isUsableSession(session)).toBe(false)
  })
})

describe('session request', () => {
  function outcome(openSession: () => Promise<SessionOpened>): Promise<{ opened: SessionOpened[]; refused: SessionRefused[] }> {
    const opened: SessionOpened[] = []
    const refused: SessionRefused[] = []

    requestSession(openSession, (session) => opened.push(session), (refusal) => refused.push(refusal))

    return settle().then(() => ({ opened, refused }))
  }

  it('hands over a usable session', async () => {
    const session = { url: `${PARLI}/embed/abc`, origin: PARLI }

    expect(await outcome(() => Promise.resolve(session))).toEqual({ opened: [session], refused: [] })
  })

  it('turns a malformed session into a network failure', async () => {
    const malformed = { url: 'javascript:alert(1)', origin: PARLI }

    expect(await outcome(() => Promise.resolve(malformed))).toEqual({ opened: [], refused: [{ status: null, code: null }] })
  })

  it('passes the refusal on', async () => {
    expect(await outcome(() => Promise.reject({ status: 422, code: 'reauth_required' }))).toEqual({ opened: [], refused: [{ status: 422, code: 'reauth_required' }] })
  })

  it('turns an openSession that throws synchronously into a network failure', async () => {
    const throwing = (): Promise<SessionOpened> => {
      throw new Error('route() is not defined')
    }

    expect(await outcome(throwing)).toEqual({ opened: [], refused: [{ status: null, code: null }] })
  })
})

describe('frame slot', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  function slotIn(container: HTMLElement, received: EmbedMessage[], configure?: (iframe: HTMLIFrameElement) => void) {
    return createFrameSlot({ container, brand: BRAND, kind: CONVERSATION_FRAME, frame: configure === undefined ? undefined : { configure }, onMessage: (message) => received.push(message) })
  }

  it('mounts an iframe with src, allow, sandbox and title', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const slot = slotIn(container, [])

    slot.mount(`${PARLI}/embed/abc`, PARLI)
    const iframe = onlyFrame(container)

    expect(iframe?.getAttribute('src')).toBe(`${PARLI}/embed/abc`)
    expect(iframe?.getAttribute('allow')).toBe('clipboard-write')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation')
    expect(iframe?.getAttribute('title')).toBe('Conversa no WhatsApp')
    slot.stop()
  })

  it('gives the inbox microphone, fullscreen, autoplay and modals', () => {
    expect(INBOX_FRAME.allow).toBe('clipboard-write; microphone; fullscreen; autoplay')
    expect(INBOX_FRAME.sandbox).toBe(`${CONVERSATION_FRAME.sandbox} allow-modals`)
  })

  it('lets the app configure every new iframe and name it', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const configured: HTMLIFrameElement[] = []
    const slot = createFrameSlot({
      container,
      brand: BRAND,
      kind: CONVERSATION_FRAME,
      frame: { title: 'Conversa com o cliente', configure: (iframe) => configured.push(iframe) },
      onMessage: () => {},
    })

    slot.mount(`${PARLI}/embed/a`, PARLI)
    slot.mount(`${PARLI}/embed/b`, PARLI)

    expect(configured).toHaveLength(2)
    expect(configured[1]).toBe(framesIn(container)[0])
    expect(configured[1]?.getAttribute('title')).toBe('Conversa com o cliente')
    slot.stop()
  })

  it('always creates a new element and keeps a single iframe', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const slot = slotIn(container, [])

    slot.mount(`${PARLI}/embed/a`, PARLI)
    const first = onlyFrame(container)
    slot.mount(`${PARLI}/embed/b`, PARLI)

    expect(framesIn(container)).toHaveLength(1)
    expect(onlyFrame(container)).not.toBe(first)
    slot.stop()
  })

  it('delivers messages of the current iframe only', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const received: EmbedMessage[] = []
    const slot = slotIn(container, received)

    slot.mount(`${PARLI}/embed/a`, PARLI)
    const old = onlyFrame(container)
    slot.mount(`${PARLI}/embed/b`, PARLI)
    postFrom(old, { type: 'ready' })
    postFrom(onlyFrame(container), { type: 'resize', height: 500 })

    expect(received).toEqual([{ type: 'resize', height: 500 }])
    slot.stop()
  })

  it('delivers nothing after unmount or stop', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const received: EmbedMessage[] = []
    const slot = slotIn(container, received)

    slot.mount(`${PARLI}/embed/a`, PARLI)
    const iframe = onlyFrame(container)
    slot.stop()
    postFrom(iframe, { type: 'ready' })

    expect(received).toEqual([])
    expect(framesIn(container)).toEqual([])
  })

  it('does not throw when the app already removed the container', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const slot = slotIn(container, [])

    slot.mount(`${PARLI}/embed/a`, PARLI)
    container.remove()

    expect(() => slot.stop()).not.toThrow()
  })
})
