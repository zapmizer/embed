import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createInbox } from '../src/inbox'
import type { Inbox, InboxOptions } from '../src/inbox'
import type { EmbedState } from '../src/state'
import { START, fakeClock } from './support/clock'
import type { FakeClock } from './support/clock'
import { BRAND, PARLI, appendFrame, framesIn, onlyFrame, postFrom } from './support/frames'
import { RESUME_URL, START_URL, scriptedSessions, session, settle } from './support/sessions'
import type { ScriptedSessions } from './support/sessions'
import { captureMicrotaskErrors } from './support/microtasks'
import { memoryStorage } from './support/storage'

const KEY = 'parli-inbox:7:3'
const END_EVENTS: Array<'session_expired' | 'session_revoked' | 'session_replaced' | 'subscription_required'> = ['session_expired', 'session_revoked', 'session_replaced', 'subscription_required']

let container: HTMLDivElement
let clock: FakeClock
let sessions: ScriptedSessions
let states: EmbedState[]
let pings: number
let pingFailure: unknown
let inbox: Inbox

function inAnHour(): string {
  return new Date(START + 60 * 60 * 1000).toISOString()
}

function rememberResume(key: string = KEY, url: string = RESUME_URL): void {
  window.sessionStorage.setItem(key, JSON.stringify({ url, origin: PARLI, until: inAnHour() }))
}

function storedResume(key: string = KEY): { url: string; origin: string; until: string } | null {
  return JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
}

function open(overrides: Partial<InboxOptions> = {}): Inbox {
  inbox = createInbox({
    container,
    brand: BRAND,
    person: '7:3',
    openSession: sessions.openSession,
    clock,
    keepAlive: () => {
      pings += 1

      return pingFailure === null ? Promise.resolve() : Promise.reject(pingFailure)
    },
    onState: (state) => states.push(state),
    ...overrides,
  })

  return inbox
}

async function openLoaded(withResume: boolean = true, overrides: Partial<InboxOptions> = {}): Promise<HTMLIFrameElement | null> {
  open(overrides)
  sessions.resolve(0, session('abc', withResume))
  await settle()

  return onlyFrame(container)
}

describe('embedded inbox', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    container = document.body.appendChild(document.createElement('div'))
    clock = fakeClock()
    sessions = scriptedSessions()
    states = []
    pings = 0
    pingFailure = null
  })

  afterEach(() => {
    inbox.destroy()
    document.body.innerHTML = ''
  })

  it('asks for an inbox session when nothing is remembered', () => {
    open()

    expect(sessions.calls()).toBe(1)
  })

  it('shows the inbox returned by the session with the inbox permissions', async () => {
    const iframe = await openLoaded()

    expect(iframe?.getAttribute('src')).toBe(START_URL)
    expect(iframe?.getAttribute('allow')).toBe('clipboard-write; microphone; fullscreen; autoplay')
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation allow-modals')
    expect(iframe?.getAttribute('title')).toBe('Caixa de entrada do WhatsApp')
  })

  it('keeps waiting for the heavy inbox until 45 s, then shows the deadline error with the iframe alive', async () => {
    await openLoaded()

    clock.advance(44_999)
    expect(inbox.state.status).toBe('loading')
    clock.advance(1)

    expect(inbox.state).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
    expect(framesIn(container)).toHaveLength(1)
  })

  it('shows the inbox when its ready arrives after the deadline, without a new session', async () => {
    const iframe = await openLoaded()

    clock.advance(45_000)
    postFrom(iframe, { type: 'ready' })

    expect(inbox.state).toEqual({ status: 'ready', frame: 'live' })
    expect(sessions.calls()).toBe(1)
  })

  it('renews the session when it expires after the inbox loaded', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })

    expect(sessions.calls()).toBe(2)
    expect(inbox.state).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('offers a retry when the renewed session expires within a minute', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    sessions.resolve(1, session('b'))
    await settle()
    postFrom(onlyFrame(container), { type: 'ready' })
    clock.advance(30_000)
    postFrom(onlyFrame(container), { type: 'session_expired' })

    expect(sessions.calls()).toBe(2)
    expect(inbox.state).toEqual({ status: 'error', frame: 'none', code: 'inbox_expired', action: 'retry' })
  })

  it('renews by itself again when the renewed session expires after a minute', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    sessions.resolve(1, session('b'))
    await settle()
    postFrom(onlyFrame(container), { type: 'ready' })
    clock.advance(60_000)
    postFrom(onlyFrame(container), { type: 'session_expired' })

    expect(sessions.calls()).toBe(3)
  })

  it('never reopens by itself when another tab took the inbox', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_replaced' })

    expect(sessions.calls()).toBe(1)
    expect(inbox.state).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
    expect(framesIn(container)).toEqual([])
  })

  it('opens one new session when the user takes the inbox back to this tab (S1)', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_replaced' })
    inbox.retry()
    inbox.retry()

    expect(sessions.calls()).toBe(2)
  })

  it('loads the inbox the other tab remembered when the user takes it back with a shared storage', async () => {
    const shared = memoryStorage()
    const iframe = await openLoaded(true, { storage: shared })

    postFrom(iframe, { type: 'ready' })
    shared.setItem(KEY, JSON.stringify({ url: `${PARLI}/chats?embed_inbox=other-tab`, origin: PARLI, until: inAnHour() }))
    postFrom(iframe, { type: 'session_replaced' })
    inbox.retry()

    expect(sessions.calls()).toBe(1)
    expect(onlyFrame(container)?.getAttribute('src')).toBe(`${PARLI}/chats?embed_inbox=other-tab`)
  })

  it('does not stop the new session when the old inbox complains during the pending request (F11)', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    postFrom(iframe, { type: 'session_revoked' })
    sessions.resolve(1, session('b'))
    await settle()

    expect(inbox.state).toEqual({ status: 'loading', frame: 'loading' })
  })

  it('ignores a message from another iframe of the same origin (S15)', async () => {
    await openLoaded()

    postFrom(appendFrame(), { type: 'ready' })

    expect(inbox.state.status).toBe('loading')
  })

  it.each([
    ['the connected number is unavailable', { status: 422, code: 'number_unavailable' }, 'number_unavailable', 'reconnect'],
    ['the approver lost access to the number', { status: 422, code: 'approver_without_access' }, 'approver_without_access', null],
    ['the subscription is inactive', { status: 422, code: 'subscription_required' }, 'subscription_required', 'checkout'],
    ['too many openings', { status: 429, code: 'rate_limited' }, 'rate_limited', 'retry'],
    ['the service is unavailable', { status: 503, code: 'unavailable' }, 'unavailable', 'retry'],
  ] as const)('shows the refusal when %s', async (_, refusal, code, action) => {
    open()
    sessions.reject(0, refusal)
    await settle()

    expect(inbox.state).toEqual({ status: 'error', frame: 'none', code, action })
  })

  describe('keepalive', () => {
    it('does not ping before 15 minutes', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      clock.advance(15 * 60_000 - 1)

      expect(pings).toBe(0)
    })

    it('pings every 15 minutes while the inbox is visible and ready', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      clock.advance(30 * 60_000)

      expect(pings).toBe(2)
    })

    it('does not ping while the inbox is loading or in error', async () => {
      await openLoaded()

      clock.advance(15 * 60_000)

      expect(pings).toBe(0)
    })

    it('does not ping while the inbox is hidden', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      inbox.setVisible(false)
      clock.advance(15 * 60_000)

      expect(pings).toBe(0)
    })

    it('stops pinging after destroy', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      inbox.destroy()
      clock.advance(15 * 60_000)

      expect(pings).toBe(0)
      expect(clock.pending()).toBe(0)
    })

    it.each([
      ['the server failed', { status: 500 }],
      ['the network failed', new Error('Network Error')],
    ])('keeps the inbox open when the ping fails because %s', async (_, failure) => {
      const iframe = await openLoaded()

      pingFailure = failure
      postFrom(iframe, { type: 'ready' })
      clock.advance(15 * 60_000)
      await settle()

      expect(inbox.state).toEqual({ status: 'ready', frame: 'live' })
    })

    it.each([401, 419])('closes the inbox and forgets every remembered inbox when the ping finds the app session over (%i) (S12)', async (status) => {
      rememberResume('parli-inbox:8:4')
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      pingFailure = { status }
      clock.advance(15 * 60_000)
      await settle()

      expect(inbox.state).toEqual({ status: 'closed', frame: 'none' })
      expect(framesIn(container)).toEqual([])
      expect(Object.keys(window.sessionStorage).filter((key) => key.startsWith('parli-inbox:'))).toEqual([])
    })
  })

  describe('way back', () => {
    it('opens the remembered inbox without asking for a new session (S8)', () => {
      rememberResume()
      open()

      expect(sessions.calls()).toBe(0)
      expect(onlyFrame(container)?.getAttribute('src')).toBe(RESUME_URL)
    })

    it('asks for one new session when the remembered inbox answers session_expired before loading (S9)', () => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'session_expired' })

      expect(sessions.calls()).toBe(1)
      expect(storedResume()).toBeNull()
    })

    it.each(['session_revoked', 'subscription_required'] as const)('shows %s when the remembered inbox answers it before loading and forgets it', (type) => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type })

      expect(sessions.calls()).toBe(0)
      expect(inbox.state.status).toBe('error')
      expect(storedResume()).toBeNull()
    })

    it('shows session_replaced with the button when the remembered inbox was taken by another tab (H1, sessionStorage)', () => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'session_replaced' })

      expect(sessions.calls()).toBe(0)
      expect(inbox.state).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
      expect(storedResume()).toBeNull()
    })

    it('follows the entry another tab wrote when the remembered inbox was taken (H1, shared storage)', () => {
      const shared = memoryStorage({ [KEY]: JSON.stringify({ url: RESUME_URL, origin: PARLI, until: inAnHour() }) })

      open({ storage: shared })
      shared.setItem(KEY, JSON.stringify({ url: `${PARLI}/chats?embed_inbox=other-tab`, origin: PARLI, until: inAnHour() }))
      postFrom(onlyFrame(container), { type: 'session_replaced' })

      expect(sessions.calls()).toBe(0)
      expect(onlyFrame(container)?.getAttribute('src')).toBe(`${PARLI}/chats?embed_inbox=other-tab`)
    })

    it('asks for only one new session when the remembered inbox ends twice before loading', () => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'session_expired' })
      postFrom(onlyFrame(container), { type: 'session_replaced' })

      expect(sessions.calls()).toBe(1)
    })

    it('remembers the way back once the inbox is ready', async () => {
      const iframe = await openLoaded()

      expect(storedResume()).toBeNull()
      postFrom(iframe, { type: 'ready' })

      expect(storedResume()).toEqual({ url: RESUME_URL, origin: PARLI, until: '2026-10-07T14:00:00+00:00' })
    })

    it('remembers nothing when the session brings no way back', async () => {
      const iframe = await openLoaded(false)

      postFrom(iframe, { type: 'ready' })

      expect(storedResume()).toBeNull()
    })

    it.each([null, ''])('opens a fresh inbox and touches no storage when the person is %p', async (person) => {
      rememberResume()
      rememberResume('parli-inbox:8:3')
      const iframe = await openLoaded(true, { person })

      postFrom(iframe, { type: 'ready' })
      postFrom(iframe, { type: 'session_revoked' })

      expect(sessions.calls()).toBe(1)
      expect(Object.keys(window.sessionStorage).sort()).toEqual([KEY, 'parli-inbox:8:3'])
    })

    it.each([
      ['another user', 'parli-inbox:8:3'],
      ['another team', 'parli-inbox:7:4'],
    ])('does not open and forgets the inbox remembered for %s', (_, key) => {
      rememberResume(key)
      open()

      expect(sessions.calls()).toBe(1)
      expect(storedResume(key)).toBeNull()
    })

    it.each(END_EVENTS)('forgets the remembered inbox when it answers %s after loading', (type) => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'ready' })
      postFrom(onlyFrame(container), { type })

      expect(storedResume()).toBeNull()
    })

    it('renews the session when a remembered inbox expires after loading', () => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'ready' })
      postFrom(onlyFrame(container), { type: 'session_expired' })

      expect(sessions.calls()).toBe(1)
    })

    it('shows the deadline error without a new session and forgets the remembered inbox that does not load', () => {
      rememberResume()
      open()

      clock.advance(45_000)

      expect(inbox.state).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
      expect(sessions.calls()).toBe(0)
      expect(storedResume()).toBeNull()
    })

    it('does not remember again the inbox forgotten at the deadline when it loads late', () => {
      rememberResume()
      open()

      clock.advance(45_000)
      postFrom(onlyFrame(container), { type: 'ready' })

      expect(inbox.state.status).toBe('ready')
      expect(storedResume()).toBeNull()
    })

    it('does not remember the way back of a new inbox that loads after the deadline (S13)', async () => {
      const iframe = await openLoaded()

      clock.advance(45_000)
      postFrom(iframe, { type: 'ready' })

      expect(storedResume()).toBeNull()
    })

    it('does not remember the way back of a new inbox that was stopped before loading', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'session_expired' })
      postFrom(iframe, { type: 'ready' })

      expect(storedResume()).toBeNull()
    })

    it('shows the expired error instead of asking again when the new inbox also ends before loading (S2)', async () => {
      rememberResume()
      open()

      postFrom(onlyFrame(container), { type: 'session_expired' })
      sessions.resolve(0, session('b'))
      await settle()
      postFrom(onlyFrame(container), { type: 'session_expired' })

      expect(sessions.calls()).toBe(1)
      expect(framesIn(container)).toEqual([])
      expect(inbox.state).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
    })

    it('keeps the way back of a later visit when an earlier visit answered after leaving', async () => {
      open()
      inbox.destroy()
      sessions.resolve(0, session('old', true))
      await settle()
      rememberResume()
      clock.advance(45_000)

      expect(storedResume()?.url).toBe(RESUME_URL)
    })

    it('keeps the way back on destroy', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      inbox.destroy()

      expect(storedResume()?.url).toBe(RESUME_URL)
    })

    it('keeps the entry another tab wrote when this tab loses the inbox (shared storage)', async () => {
      const shared = memoryStorage()
      const iframe = await openLoaded(true, { storage: shared })

      postFrom(iframe, { type: 'ready' })
      shared.setItem(KEY, JSON.stringify({ url: `${PARLI}/chats?embed_inbox=other-tab`, origin: PARLI, until: inAnHour() }))
      postFrom(iframe, { type: 'session_replaced' })

      expect(JSON.parse(shared.getItem(KEY) ?? 'null')?.url).toBe(`${PARLI}/chats?embed_inbox=other-tab`)
    })
  })

  describe('visibility', () => {
    it('does not open a new session while hidden when the session expires, and opens it when shown (S5)', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      inbox.setVisible(false)
      postFrom(iframe, { type: 'session_expired' })
      expect(sessions.calls()).toBe(1)
      inbox.setVisible(true)

      expect(sessions.calls()).toBe(2)
    })

    it('tries again by itself when shown after failing while hidden', async () => {
      await openLoaded()

      inbox.setVisible(false)
      clock.advance(45_000)
      inbox.setVisible(true)

      expect(sessions.calls()).toBe(2)
    })

    it('does not try again when the inbox that failed while hidden loads before being shown', async () => {
      const iframe = await openLoaded()

      inbox.setVisible(false)
      clock.advance(45_000)
      postFrom(iframe, { type: 'ready' })
      inbox.setVisible(true)

      expect(sessions.calls()).toBe(1)
      expect(inbox.state).toEqual({ status: 'ready', frame: 'live' })
    })

    it('does not take the inbox back by itself when another tab took it while hidden (S20)', async () => {
      const iframe = await openLoaded()

      postFrom(iframe, { type: 'ready' })
      inbox.setVisible(false)
      postFrom(iframe, { type: 'session_replaced' })
      inbox.setVisible(true)

      expect(sessions.calls()).toBe(1)
    })
  })

  it('ignores calls after destroy', async () => {
    await openLoaded()

    inbox.destroy()
    inbox.destroy()
    inbox.retry()
    inbox.setVisible(false)
    inbox.setVisible(true)

    expect(sessions.calls()).toBe(1)
    expect(states.filter((state) => state.status === 'closed')).toHaveLength(1)
  })

  it('does not let an onState that throws on the first state escape createInbox', async () => {
    const microtasks = captureMicrotaskErrors()
    const failure = new Error('app failed')

    try {
      expect(() =>
        open({
          onState: () => {
            throw failure
          },
        }),
      ).not.toThrow()
      expect(inbox.state.status).toBe('opening')
      expect(sessions.calls()).toBe(1)
      inbox.destroy()
      await settle()
    } finally {
      microtasks.restore()
    }

    expect(microtasks.thrown()).toEqual([failure, failure])
  })

  it('releases the iframe, the listener and the keepalive when onState throws on closed', async () => {
    const microtasks = captureMicrotaskErrors()
    const failure = new Error('app failed')
    const iframe = await openLoaded(true, {
      onState: (state) => {
        states.push(state)

        if (state.status === 'closed') {
          throw failure
        }
      },
    })

    postFrom(iframe, { type: 'ready' })

    try {
      expect(() => inbox.destroy()).not.toThrow()
      await settle()
    } finally {
      microtasks.restore()
    }

    postFrom(iframe, { type: 'session_expired' })

    expect(inbox.state).toEqual({ status: 'closed', frame: 'none' })
    expect(framesIn(container)).toEqual([])
    expect(clock.pending()).toBe(0)
    expect(sessions.calls()).toBe(1)
    expect(microtasks.thrown()).toEqual([failure])
  })
})
