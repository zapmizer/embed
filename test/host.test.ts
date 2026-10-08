import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createConversation } from '../src/conversation'
import { createInboxHost } from '../src/host'
import { createInbox } from '../src/inbox'
import { endEmbeds } from '../src/logout'
import type { InboxHost } from '../src/host'
import { endRegisteredEmbeds } from '../src/registry'
import type { EmbedState } from '../src/state'
import { START, fakeClock } from './support/clock'
import type { FakeClock } from './support/clock'
import { BRAND, PARLI, framesIn, onlyFrame, postFrom } from './support/frames'
import { fakeResizeObserver, placedSlot } from './support/layout'
import type { FakeResizeObservers, PlacedSlot } from './support/layout'
import { captureMicrotaskErrors } from './support/microtasks'
import { RESUME_URL, scriptedSessions, session, settle } from './support/sessions'
import type { ScriptedSessions } from './support/sessions'

const RECT = { top: 56, left: 256, width: 900, height: 700 }
const MINUTE = 60_000

let clock: FakeClock
let sessions: ScriptedSessions
let states: EmbedState[]
let resizeObservers: FakeResizeObservers
let slot: PlacedSlot
let host: InboxHost
let pingFailure: unknown

function createHost(): InboxHost {
  host = createInboxHost({
    brand: BRAND,
    openSession: sessions.openSession,
    keepAlive: () => (pingFailure === null ? Promise.resolve() : Promise.reject(pingFailure)),
    clock,
    onState: (state) => states.push(state),
  })

  return host
}

async function visitLoaded(person: string = '7:3'): Promise<HTMLIFrameElement | null> {
  host.attach(slot.element, person)
  sessions.resolve(sessions.calls() - 1, session(`s${sessions.calls()}`, true))
  await settle()
  const iframe = onlyFrame(host.element)

  postFrom(iframe, { type: 'ready' })

  return iframe
}

function isHidden(): boolean {
  return host.element.style.visibility === 'hidden' && host.element.style.pointerEvents === 'none' && host.element.inert && host.element.getAttribute('aria-hidden') === 'true'
}

describe('inbox host for SPAs', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    clock = fakeClock()
    sessions = scriptedSessions()
    states = []
    pingFailure = null
    resizeObservers = fakeResizeObserver()
    slot = placedSlot(RECT)
    createHost()
  })

  afterEach(() => {
    host.destroy()
    resizeObservers.restore()
    document.body.innerHTML = ''
  })

  it('does not open the inbox before the first visit', () => {
    expect(sessions.calls()).toBe(0)
    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(isHidden()).toBe(true)
  })

  it('lives in the body, outside the page tree, with the overlay inside it', () => {
    expect(host.element.parentElement).toBe(document.body)
    expect(host.overlay.parentElement).toBe(host.element)
    expect(host.element.style.position).toBe('fixed')
  })

  it('leaves role, label and z-index to the app', () => {
    expect(host.element.getAttribute('role')).toBeNull()
    expect(host.element.getAttribute('aria-label')).toBeNull()
    expect(host.element.style.zIndex).toBe('')
  })

  it('shows the inbox over the slot', () => {
    host.attach(slot.element, '7:3')

    expect(isHidden()).toBe(false)
    expect([host.element.style.top, host.element.style.left, host.element.style.width, host.element.style.height]).toEqual(['56px', '256px', '900px', '700px'])
    expect(sessions.calls()).toBe(1)
  })

  it('follows the slot when it changes size', () => {
    host.attach(slot.element, '7:3')

    slot.move({ top: 64, left: 0, width: 1200, height: 640 })
    resizeObservers.resize()

    expect([host.element.style.top, host.element.style.left, host.element.style.width, host.element.style.height]).toEqual(['64px', '0px', '1200px', '640px'])
  })

  it('follows the slot when the window scrolls or resizes', () => {
    host.attach(slot.element, '7:3')

    slot.move({ top: 10, left: 20, width: 300, height: 400 })
    window.dispatchEvent(new Event('scroll'))
    expect(host.element.style.top).toBe('10px')
    slot.move({ top: 30, left: 20, width: 300, height: 400 })
    window.dispatchEvent(new Event('resize'))

    expect(host.element.style.top).toBe('30px')
  })

  it('keeps the same inbox alive and out of sight while the user is on another screen (S10)', async () => {
    const iframe = await visitLoaded()

    host.detach(slot.element)

    expect(isHidden()).toBe(true)
    expect(onlyFrame(host.element)).toBe(iframe)
  })

  it('shows the inbox already loaded, without a new session, when the user comes back (S10)', async () => {
    const iframe = await visitLoaded()

    host.detach(slot.element)
    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
    expect(onlyFrame(host.element)).toBe(iframe)
    expect(host.state).toEqual({ status: 'ready', frame: 'live' })
  })

  it('ignores the detach of a slot that is not the current one', async () => {
    await visitLoaded()
    const other = placedSlot(RECT)

    host.detach(other.element)

    expect(isHidden()).toBe(false)
  })

  it('does nothing new when the same slot attaches again while shown', async () => {
    const iframe = await visitLoaded()

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
    expect(onlyFrame(host.element)).toBe(iframe)
    expect(resizeObservers.active()).toHaveLength(1)
  })

  it('opens a fresh inbox for another person and discards the previous one (S17)', async () => {
    await visitLoaded('7:3')

    host.attach(slot.element, '7:4')

    expect(sessions.calls()).toBe(2)
    expect(framesIn(host.element)).toEqual([])
    expect(isHidden()).toBe(false)
    expect(host.state).toEqual({ status: 'opening', frame: 'none' })
  })

  it('does not open a new session while hidden when the session expires, and opens it on return (S5)', async () => {
    const iframe = await visitLoaded()

    host.detach(slot.element)
    postFrom(iframe, { type: 'session_expired' })
    expect(sessions.calls()).toBe(1)
    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(2)
  })

  it('does not ping the app session while hidden', async () => {
    let pings = 0

    host.destroy()
    host = createInboxHost({
      brand: BRAND,
      openSession: sessions.openSession,
      keepAlive: () => {
        pings += 1

        return Promise.resolve()
      },
      clock,
      onState: () => {},
    })
    await visitLoaded()
    host.detach(slot.element)

    clock.advance(30 * MINUTE - 1)

    expect(pings).toBe(0)
  })

  it('keeps the hidden inbox for almost 30 minutes', async () => {
    await visitLoaded()
    host.detach(slot.element)

    clock.advance(30 * MINUTE - 1)

    expect(framesIn(host.element)).toHaveLength(1)
  })

  it('discards the inbox after 30 minutes hidden and keeps the way back (S25)', async () => {
    await visitLoaded()
    host.detach(slot.element)

    clock.advance(30 * MINUTE)

    expect(framesIn(host.element)).toEqual([])
    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(window.sessionStorage.getItem('parli-inbox:7:3')).not.toBeNull()
  })

  it('counts the 30 minutes from the last time the inbox was hidden', async () => {
    await visitLoaded()
    host.detach(slot.element)
    clock.advance(20 * MINUTE)
    host.attach(slot.element, '7:3')
    host.detach(slot.element)

    clock.advance(20 * MINUTE)

    expect(framesIn(host.element)).toHaveLength(1)
  })

  it('resumes without a new session on the visit after it was discarded for being idle (S25)', async () => {
    await visitLoaded()
    host.detach(slot.element)
    clock.advance(30 * MINUTE)

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
    expect(onlyFrame(host.element)?.getAttribute('src')).toBe(`${PARLI}/chats?embed_inbox=s1`)
  })

  it('opens a new inbox on the visit after an idle discard when nothing was remembered', async () => {
    host.attach(slot.element, '7:3')
    host.detach(slot.element)
    clock.advance(30 * MINUTE)

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(2)
  })

  it('tries again by itself when the user comes back to an inbox that failed while hidden', async () => {
    host.attach(slot.element, '7:3')
    sessions.resolve(0, session('a'))
    await settle()
    host.detach(slot.element)
    clock.advance(45_000)

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(2)
  })

  it('does not take the inbox back by itself when another tab took it while hidden', async () => {
    const iframe = await visitLoaded()

    host.detach(slot.element)
    postFrom(iframe, { type: 'session_replaced' })
    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
    expect(host.state).toMatchObject({ status: 'error', code: 'session_replaced' })
  })

  for (const code of ['reauth_required', 'connection_without_number', 'number_unavailable', 'subscription_required']) {
    it(`asks for a new session when the user comes back to an inbox refused with ${code}`, async () => {
      host.attach(slot.element, '7:3')
      sessions.reject(0, { status: 403, code })
      await settle()
      host.detach(slot.element)

      host.attach(slot.element, '7:3')

      expect(sessions.calls()).toBe(2)
    })
  }

  it('does not ask for a new session when an inbox refused with reauth_required attaches again while shown', async () => {
    host.attach(slot.element, '7:3')
    sessions.reject(0, { status: 403, code: 'reauth_required' })
    await settle()

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
  })

  it('does not ask for a new session when the user comes back to an inbox refused with no action', async () => {
    host.attach(slot.element, '7:3')
    sessions.reject(0, { status: 403, code: 'rejected' })
    await settle()
    host.detach(slot.element)

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(1)
  })

  it('retries through the host', async () => {
    host.attach(slot.element, '7:3')
    sessions.reject(0, { status: 503, code: 'unavailable' })
    await settle()

    host.retry()

    expect(sessions.calls()).toBe(2)
  })

  it('hides itself and lets clicks through when the app closes it (S26)', async () => {
    await visitLoaded()

    host.close()

    expect(isHidden()).toBe(true)
    expect(framesIn(host.element)).toEqual([])
    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(resizeObservers.active()).toEqual([])
  })

  it('brings the inbox back when it is attached again after closing', async () => {
    await visitLoaded()
    host.close()

    host.attach(slot.element, '7:3')

    expect(framesIn(host.element)).toHaveLength(1)
    expect(isHidden()).toBe(false)
  })

  it.each([401, 419])('drops the inbox and its slot when the app session is over (%i) (S12)', async (status) => {
    await visitLoaded()
    pingFailure = { status }

    clock.advance(15 * MINUTE)
    await settle()

    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(isHidden()).toBe(true)
    expect(framesIn(host.element)).toEqual([])
    expect(window.sessionStorage.getItem('parli-inbox:7:3')).toBeNull()
  })

  it('drops the inbox on logout of its brand (S11)', async () => {
    await visitLoaded()

    endRegisteredEmbeds(BRAND)

    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(isHidden()).toBe(true)
  })

  it('opens a fresh inbox on the next visit after a logout', async () => {
    await visitLoaded()
    endRegisteredEmbeds(BRAND)

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(2)
  })

  it('removes the element and stops listening on destroy', async () => {
    await visitLoaded()

    host.destroy()
    slot.move({ top: 1, left: 1, width: 1, height: 1 })
    window.dispatchEvent(new Event('resize'))

    expect(host.element.isConnected).toBe(false)
    expect(host.element.style.top).toBe('56px')
  })

  it('reports the inbox states and the final closed to the app', async () => {
    await visitLoaded()
    host.close()

    expect(states.map((state) => state.status)).toEqual(['opening', 'loading', 'ready', 'closed'])
  })

  it('does not report the closing of a discarded inbox as the host closing', async () => {
    await visitLoaded('7:3')

    host.attach(slot.element, '7:4')

    expect(states.at(-1)).toEqual({ status: 'opening', frame: 'none' })
    expect(states.filter((state) => state.status === 'closed')).toEqual([])
  })

  it('reads the way back from the time of the attach', () => {
    window.sessionStorage.setItem('parli-inbox:7:3', JSON.stringify({ url: RESUME_URL, origin: PARLI, until: new Date(START + 60 * MINUTE).toISOString() }))

    host.attach(slot.element, '7:3')

    expect(sessions.calls()).toBe(0)
  })

  it('ends every embed of the brand and opens a fresh inbox later when the app onState throws on closed', async () => {
    const microtasks = captureMicrotaskErrors()
    const failure = new Error('app failed')
    const throwOnClosed = (state: EmbedState): void => {
      if (state.status === 'closed') {
        throw failure
      }
    }

    host.destroy()
    host = createInboxHost({ brand: BRAND, openSession: sessions.openSession, keepAlive: () => Promise.resolve(), clock, onState: throwOnClosed })
    await visitLoaded()
    const conversation = createConversation({ container: document.body.appendChild(document.createElement('div')), brand: BRAND, openSession: scriptedSessions().openSession, clock, onState: throwOnClosed })
    const inbox = createInbox({ container: document.body.appendChild(document.createElement('div')), brand: BRAND, person: '8:4', openSession: scriptedSessions().openSession, keepAlive: () => Promise.resolve(), clock, onState: throwOnClosed })

    try {
      expect(() => endEmbeds({ brand: BRAND, broadcast: false })).not.toThrow()
      await settle()

      expect([host.state.status, conversation.state.status, inbox.state.status]).toEqual(['closed', 'closed', 'closed'])
      expect(isHidden()).toBe(true)
      expect(framesIn(host.element)).toEqual([])
      expect(window.sessionStorage.getItem('parli-inbox:7:3')).toBeNull()
      expect(clock.pending()).toBe(0)
      expect(microtasks.thrown()).toEqual([failure, failure, failure])

      host.attach(slot.element, '7:3')

      expect(sessions.calls()).toBe(2)
      expect(isHidden()).toBe(false)
      host.destroy()
      await settle()
    } finally {
      microtasks.restore()
    }
  })

  it('does not leave a live inbox behind when the app closes the host from the first state', async () => {
    host.destroy()
    host = createInboxHost({
      brand: BRAND,
      openSession: sessions.openSession,
      keepAlive: () => Promise.resolve(),
      clock,
      onState: (state) => {
        states.push(state)

        if (state.status === 'opening') {
          host.close()
        }
      },
    })

    host.attach(slot.element, '7:3')
    sessions.resolve(0, session('s1', true))
    await settle()

    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(isHidden()).toBe(true)
    expect(framesIn(host.element)).toEqual([])
    expect(clock.pending()).toBe(0)
    expect(resizeObservers.active()).toEqual([])
  })

  it('ignores every call after destroy', async () => {
    await visitLoaded()
    host.destroy()
    const reported = states.length

    host.attach(slot.element, '7:3')
    host.retry()
    host.detach(slot.element)
    host.close()
    host.destroy()
    clock.advance(30 * MINUTE)

    expect(sessions.calls()).toBe(1)
    expect(host.element.isConnected).toBe(false)
    expect(framesIn(host.element)).toEqual([])
    expect(host.state).toEqual({ status: 'closed', frame: 'none' })
    expect(states).toHaveLength(reported)
    expect(clock.pending()).toBe(0)
  })
})
