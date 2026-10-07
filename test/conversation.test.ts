import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createConversation } from '../src/conversation'
import type { Conversation } from '../src/conversation'
import { endRegisteredEmbeds } from '../src/registry'
import type { EmbedState } from '../src/state'
import { fakeClock } from './support/clock'
import type { FakeClock } from './support/clock'
import { BRAND, PARLI, appendFrame, framesIn, onlyFrame, postFrom } from './support/frames'
import { captureMicrotaskErrors } from './support/microtasks'
import { scriptedSessions, session, settle } from './support/sessions'
import type { ScriptedSessions } from './support/sessions'

let container: HTMLDivElement
let clock: FakeClock
let sessions: ScriptedSessions
let states: EmbedState[]
let heights: number[]
let sent: Array<string | number>
let conversation: Conversation

function open(readyTimeoutMs?: number): Conversation {
  conversation = createConversation({
    container,
    brand: BRAND,
    openSession: sessions.openSession,
    clock,
    readyTimeoutMs,
    onState: (state) => states.push(state),
    onResize: (height) => heights.push(height),
    onMessageSent: (id) => sent.push(id),
  })

  return conversation
}

async function openLoaded(): Promise<HTMLIFrameElement | null> {
  open()
  sessions.resolve(0, session('a'))
  await settle()

  return onlyFrame(container)
}

describe('embedded conversation', () => {
  beforeEach(() => {
    container = document.body.appendChild(document.createElement('div'))
    clock = fakeClock()
    sessions = scriptedSessions()
    states = []
    heights = []
    sent = []
  })

  afterEach(() => {
    conversation.destroy()
    document.body.innerHTML = ''
  })

  it('asks for a session when created', () => {
    open()

    expect(sessions.calls()).toBe(1)
    expect(conversation.state).toEqual({ status: 'opening', frame: 'none' })
  })

  it('shows the conversation returned by the session', async () => {
    const iframe = await openLoaded()

    expect(iframe?.getAttribute('src')).toBe(`${PARLI}/embed-inbox/start/a`)
    expect(conversation.state).toEqual({ status: 'loading', frame: 'loading' })
  })

  it('renders the iframe with the exact sandbox allow-list', async () => {
    const iframe = await openLoaded()

    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-storage-access-by-user-activation')
    expect(iframe?.getAttribute('allow')).toBe('clipboard-write')
  })

  it('is ready when the iframe says so', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })

    expect(conversation.state).toEqual({ status: 'ready', frame: 'live' })
    expect(states.at(-1)).toEqual({ status: 'ready', frame: 'live' })
  })

  it('follows the height reported by the conversation, raw', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'resize', height: 1200 })

    expect(heights).toEqual([1200])
  })

  it('ignores a resize coming from another origin', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'resize', height: 600 }, 'https://evil.test')

    expect(heights).toEqual([])
  })

  it('reports a message sent from the conversation', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'message_sent', message_id: 'wamid.1' })

    expect(sent).toEqual(['wamid.1'])
  })

  it.each([
    ['another embed of the same origin', () => appendFrame()],
    ['another window of the same origin', () => null],
  ])('keeps loading when a ready comes from %s (S15)', async (_, otherFrame) => {
    await openLoaded()

    postFrom(otherFrame(), { type: 'ready' })

    expect(conversation.state.status).toBe('loading')
  })

  it('does not renew the session when another iframe of the same origin reports it expired', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(appendFrame(), { type: 'session_expired' })

    expect(sessions.calls()).toBe(1)
  })

  it('renews the session when it expires after the conversation loaded', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })

    expect(sessions.calls()).toBe(2)
    expect(conversation.state).toEqual({ status: 'opening', frame: 'stale' })
    expect(framesIn(container)).toHaveLength(1)
  })

  it('swaps the stale iframe for the new one when the renewed session arrives', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    sessions.resolve(1, session('b'))
    await settle()

    expect(framesIn(container).map((frame) => frame.getAttribute('src'))).toEqual([`${PARLI}/embed-inbox/start/b`])
  })

  it('renews by itself at most once a minute, then shows the button', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    sessions.resolve(1, session('b'))
    await settle()
    postFrom(onlyFrame(container), { type: 'ready' })
    clock.advance(59_999)
    postFrom(onlyFrame(container), { type: 'session_expired' })

    expect(sessions.calls()).toBe(2)
    expect(conversation.state).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
  })

  it.each([
    ['session_revoked', 'retry'],
    ['subscription_required', 'checkout'],
  ] as const)('shows %s after ready without reopening (S4)', async (type, action) => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type })

    expect(sessions.calls()).toBe(1)
    expect(conversation.state).toEqual({ status: 'error', frame: 'none', code: type, action })
    expect(framesIn(container)).toEqual([])
  })

  it('does not retry by itself when the session expires before the conversation loaded', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'session_expired' })

    expect(sessions.calls()).toBe(1)
    expect(conversation.state).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
  })

  it('keeps the session expired error instead of the deadline error after 45 s', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'session_expired' })
    clock.advance(45_000)

    expect(conversation.state).toMatchObject({ code: 'session_expired' })
  })

  it('does not leave an error over the conversation when a second expiration arrives while reopening', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    postFrom(iframe, { type: 'session_expired' })
    sessions.resolve(1, session('b'))
    await settle()

    expect(conversation.state).toEqual({ status: 'loading', frame: 'loading' })
  })

  it('does not consider the new session ready when the old iframe ready arrives during the pending request (F11)', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    postFrom(iframe, { type: 'session_expired' })
    postFrom(iframe, { type: 'ready' })

    expect(conversation.state).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('shows the deadline error and keeps the iframe when ready does not arrive in 45 s (S3)', async () => {
    await openLoaded()

    clock.advance(44_999)
    expect(conversation.state.status).toBe('loading')
    clock.advance(1)

    expect(conversation.state).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
    expect(framesIn(container)).toHaveLength(1)
  })

  it('accepts a ready that arrives after the deadline', async () => {
    const iframe = await openLoaded()

    clock.advance(45_000)
    postFrom(iframe, { type: 'ready' })

    expect(conversation.state).toEqual({ status: 'ready', frame: 'live' })
  })

  it('takes a custom deadline', async () => {
    open(10_000)
    sessions.resolve(0, session('a'))
    await settle()

    clock.advance(10_000)

    expect(conversation.state.status).toBe('error')
  })

  it('does not show the deadline error when ready arrives in time', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    clock.advance(45_000)

    expect(conversation.state).toEqual({ status: 'ready', frame: 'live' })
  })

  it('opens exactly one new session when retry is clicked after the deadline', async () => {
    await openLoaded()

    clock.advance(45_000)
    conversation.retry()

    expect(sessions.calls()).toBe(2)
    expect(framesIn(container)).toEqual([])
  })

  it('opens one new session when the user retries after an early expiration', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'session_expired' })
    conversation.retry()
    sessions.resolve(1, session('b'))
    await settle()

    expect(sessions.calls()).toBe(2)
    expect(onlyFrame(container)?.getAttribute('src')).toBe(`${PARLI}/embed-inbox/start/b`)
  })

  it.each([
    ['too many openings', { status: 429, code: 'rate_limited', retryAfter: 30 }, { status: 'error', frame: 'none', code: 'rate_limited', action: 'retry', retryAfter: 30 }],
    ['the service is unavailable', { status: 503, code: 'unavailable' }, { status: 'error', frame: 'none', code: 'unavailable', action: 'retry' }],
    ['the network failed', new Error('Network Error'), { status: 'error', frame: 'none', code: 'unavailable', action: 'retry' }],
    ['the number is official', { status: 422, code: 'official_number_unsupported' }, { status: 'error', frame: 'none', code: 'official_number_unsupported', action: null }],
    ['WhatsApp must be reconnected', { status: 422, code: 'reauth_required' }, { status: 'error', frame: 'none', code: 'reauth_required', action: 'reconnect' }],
    ['the subscription is inactive', { status: 422, code: 'subscription_required' }, { status: 'error', frame: 'none', code: 'subscription_required', action: 'checkout' }],
    ['the app session expired', { status: 419, code: null }, { status: 'error', frame: 'none', code: 'app_session_expired', action: 'reload' }],
    ['the address is not allowed', { status: 403, code: 'origin_not_allowed' }, { status: 'error', frame: 'none', code: 'origin_not_allowed', action: null }],
    ['the customer has no phone', { status: 422, code: 'customer_without_phone' }, { status: 'error', frame: 'none', code: 'customer_without_phone', action: null }],
  ])('shows the error when %s', async (_, refusal, expected) => {
    open()
    sessions.reject(0, refusal)
    await settle()

    expect(conversation.state).toEqual(expected as EmbedState)
    expect(framesIn(container)).toEqual([])
  })

  it('reopens the session when the user says the subscription was already made', async () => {
    open()
    sessions.reject(0, { status: 422, code: 'subscription_required' })
    await settle()

    conversation.retry()

    expect(sessions.calls()).toBe(2)
  })

  it('keeps only the newest session when an older answer arrives late (reopen)', async () => {
    open()
    conversation.reopen()
    sessions.resolve(1, session('new'))
    await settle()
    sessions.resolve(0, session('old'))
    await settle()

    expect(framesIn(container).map((frame) => frame.getAttribute('src'))).toEqual([`${PARLI}/embed-inbox/start/new`])
  })

  it('opens a new session over the stale iframe when the app reopens it (S22)', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })
    conversation.reopen()

    expect(sessions.calls()).toBe(2)
    expect(conversation.state).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('does not reopen when the error cannot be solved by retrying (S22)', async () => {
    open()
    sessions.reject(0, { status: 422, code: 'official_number_unsupported' })
    await settle()

    conversation.reopen()

    expect(sessions.calls()).toBe(1)
  })

  it('shows the error instead of mounting a malformed session', async () => {
    open()
    sessions.resolve(0, { url: 'javascript:alert(1)', origin: PARLI })
    await settle()

    expect(conversation.state).toEqual({ status: 'error', frame: 'none', code: 'unavailable', action: 'retry' })
    expect(framesIn(container)).toEqual([])
  })

  it('discards the session that arrives after destroy (S14)', async () => {
    open()
    conversation.destroy()
    sessions.resolve(0, session('a'))
    await settle()

    expect(framesIn(container)).toEqual([])
    expect(conversation.state).toEqual({ status: 'closed', frame: 'none' })
  })

  it('stops listening and removes the iframe on destroy', async () => {
    const iframe = await openLoaded()

    conversation.destroy()
    postFrom(iframe, { type: 'resize', height: 700 })

    expect(heights).toEqual([])
    expect(framesIn(container)).toEqual([])
  })

  it('ignores calls after destroy', async () => {
    await openLoaded()

    conversation.destroy()
    conversation.destroy()
    conversation.retry()
    conversation.reopen()
    clock.advance(45_000)

    expect(sessions.calls()).toBe(1)
    expect(states.filter((state) => state.status === 'closed')).toHaveLength(1)
  })

  it('closes on logout of its brand and leaves another brand alone', async () => {
    await openLoaded()

    endRegisteredEmbeds('zapmizer')
    expect(conversation.state.status).toBe('loading')
    endRegisteredEmbeds(BRAND)

    expect(conversation.state).toEqual({ status: 'closed', frame: 'none' })
    expect(framesIn(container)).toEqual([])
  })

  it('reports every change of state to the app', async () => {
    const iframe = await openLoaded()

    postFrom(iframe, { type: 'ready' })

    expect(states.map((state) => state.status)).toEqual(['opening', 'loading', 'ready'])
  })

  it('does not let an onState that throws on the first state escape createConversation', async () => {
    const microtasks = captureMicrotaskErrors()
    const failure = new Error('app failed')

    try {
      expect(() => {
        conversation = createConversation({
          container,
          brand: BRAND,
          openSession: sessions.openSession,
          clock,
          onState: () => {
            throw failure
          },
        })
      }).not.toThrow()
      expect(conversation.state.status).toBe('opening')
      expect(sessions.calls()).toBe(1)
      conversation.destroy()
      await settle()
    } finally {
      microtasks.restore()
    }

    expect(microtasks.thrown()).toEqual([failure, failure])
  })

  it('keeps working when onResize and onMessageSent throw', async () => {
    const microtasks = captureMicrotaskErrors()
    const resizeFailure = new Error('resize failed')
    const sentFailure = new Error('sent failed')

    conversation = createConversation({
      container,
      brand: BRAND,
      openSession: sessions.openSession,
      clock,
      onState: (state) => states.push(state),
      onResize: () => {
        throw resizeFailure
      },
      onMessageSent: () => {
        throw sentFailure
      },
    })
    sessions.resolve(0, session('a'))
    await settle()
    const iframe = onlyFrame(container)

    try {
      postFrom(iframe, { type: 'ready' })
      postFrom(iframe, { type: 'resize', height: 640 })
      postFrom(iframe, { type: 'message_sent', message_id: 'm1' })
      postFrom(iframe, { type: 'resize', height: 480 })
      await settle()
    } finally {
      microtasks.restore()
    }

    expect(conversation.state).toEqual({ status: 'ready', frame: 'live' })
    expect(microtasks.thrown()).toEqual([resizeFailure, sentFailure, resizeFailure])
  })

  it('releases the iframe and the deadline when onState throws on closed', async () => {
    const microtasks = captureMicrotaskErrors()
    const failure = new Error('app failed')

    conversation = createConversation({
      container,
      brand: BRAND,
      openSession: sessions.openSession,
      clock,
      onState: (state) => {
        if (state.status === 'closed') {
          throw failure
        }
      },
    })
    sessions.resolve(0, session('a'))
    await settle()

    try {
      expect(() => conversation.destroy()).not.toThrow()
      await settle()
    } finally {
      microtasks.restore()
    }

    expect(conversation.state).toEqual({ status: 'closed', frame: 'none' })
    expect(framesIn(container)).toEqual([])
    expect(clock.pending()).toBe(0)
    expect(microtasks.thrown()).toEqual([failure])
  })
})
