import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { initialState, transition } from '../../src/machine/conversation'
import type { ConversationEvent, ConversationMachine, ConversationStep } from '../../src/machine/conversation'

const NOW = Date.parse('2026-10-07T12:00:00Z')
const URL_A = 'http://parli.test/embed/a'
const URL_B = 'http://parli.test/embed/b'
const ORIGIN = 'http://parli.test'

function step(state: ConversationMachine, event: ConversationEvent, now: number = NOW): ConversationStep {
  return transition(state, event, { now })
}

function through(events: ConversationEvent[], now: number = NOW): ConversationMachine {
  return events.reduce((state, event) => step(state, event, now).state, initialState())
}

function opened(gen: number, url: string = URL_A): ConversationEvent {
  return { type: 'session_opened', gen, session: { url, origin: ORIGIN } }
}

function frame(type: 'ready' | 'session_expired' | 'session_revoked' | 'subscription_required' | 'session_replaced'): ConversationEvent {
  return { type: 'iframe', message: { type } }
}

const opening = (): ConversationMachine => through([{ type: 'start' }])
const loading = (): ConversationMachine => through([{ type: 'start' }, opened(0)])
const ready = (): ConversationMachine => through([{ type: 'start' }, opened(0), frame('ready')])
const timedOut = (): ConversationMachine => through([{ type: 'start' }, opened(0), { type: 'ready_timeout', gen: 1 }])
const reopening = (): ConversationMachine => step(ready(), frame('session_expired')).state

describe('conversation machine — table', () => {
  it('idle + start → opening(none), open_session', () => {
    const result = step(initialState(), { type: 'start' })

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'open_session', gen: 0 }, { type: 'notify' }])
  })

  it('opening + session_opened → loading, mount_iframe, arm_ready_timeout with the new gen', () => {
    const result = step(opening(), opened(0))

    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
    expect(result.state.gen).toBe(1)
    expect(result.effects).toEqual([{ type: 'mount_iframe', url: URL_A, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: 1 }, { type: 'notify' }])
  })

  it('opening(stale) + session_opened → unmounts the old iframe before mounting the new one', () => {
    const result = step(reopening(), opened(1, URL_B))

    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'mount_iframe', url: URL_B, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: 2 }, { type: 'notify' }])
  })

  it('opening + session_refused → error(code, none)', () => {
    const result = step(opening(), { type: 'session_refused', gen: 0, refusal: { status: 422, code: 'reauth_required' } })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'reauth_required', action: 'reconnect' })
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it('opening + session_refused carries Retry-After', () => {
    const result = step(opening(), { type: 'session_refused', gen: 0, refusal: { status: 429, code: 'rate_limited', retryAfter: 30 } })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'rate_limited', action: 'retry', retryAfter: 30 })
  })

  it.each(['ready', 'session_expired', 'session_revoked', 'subscription_required'] as const)('opening ignores %s from the old iframe (F11)', (type) => {
    const before = reopening()
    const result = step(before, frame(type))

    expect(result.state).toBe(before)
    expect(result.effects).toEqual([])
  })

  it('opening ignores resize', () => {
    const before = reopening()

    expect(step(before, { type: 'iframe', message: { type: 'resize', height: 600 } }).effects).toEqual([])
  })

  it('loading + ready → ready, clear_ready_timeout', () => {
    const result = step(loading(), frame('ready'))

    expect(result.state.view).toEqual({ status: 'ready', frame: 'live' })
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'notify' }])
  })

  it.each([
    ['session_expired', 'retry'],
    ['session_revoked', 'retry'],
    ['subscription_required', 'checkout'],
  ] as const)('loading + %s → error(code, none), clear_ready_timeout, unmount_iframe', (type, action) => {
    const result = step(loading(), frame(type))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: type, action })
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('loading + ready_timeout → error(ready_timeout, loading), iframe kept', () => {
    const result = step(loading(), { type: 'ready_timeout', gen: 1 })

    expect(result.state.view).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it('error(loading) + ready → ready', () => {
    const result = step(timedOut(), frame('ready'))

    expect(result.state.view).toEqual({ status: 'ready', frame: 'live' })
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it('error(loading) + session_expired → error(session_expired, none), unmount_iframe', () => {
    const result = step(timedOut(), frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('ready + session_expired, never reopened → opening(stale), open_session, lastAutoReopenAt = now', () => {
    const result = step(ready(), frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'opening', frame: 'stale' })
    expect(result.state.lastAutoReopenAt).toBe(NOW)
    expect(result.effects).toEqual([{ type: 'open_session', gen: 1 }, { type: 'notify' }])
  })

  it('ready + session_expired 60 s after the last reopening → reopens again', () => {
    const second = step(reopening(), opened(1, URL_B)).state
    const readyAgain = step(second, frame('ready')).state
    const result = step(readyAgain, frame('session_expired'), NOW + 60_000)

    expect(result.state.view).toEqual({ status: 'opening', frame: 'stale' })
    expect(result.state.lastAutoReopenAt).toBe(NOW + 60_000)
  })

  it('ready + session_expired less than 60 s after the last reopening → error(session_expired, none)', () => {
    const second = step(reopening(), opened(1, URL_B)).state
    const readyAgain = step(second, frame('ready')).state
    const result = step(readyAgain, frame('session_expired'), NOW + 59_999)

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it.each([
    ['session_revoked', 'retry'],
    ['subscription_required', 'checkout'],
  ] as const)('ready + %s → error without reopening (S4)', (type, action) => {
    const result = step(ready(), frame(type))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: type, action })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it.each([
    ['opening', opening, 'none'],
    ['loading', loading, 'stale'],
    ['ready', ready, 'stale'],
    ['error(loading)', timedOut, 'stale'],
  ] as const)('%s + reopen → opening(%s), open_session with gen++', (_, from, staleness) => {
    const before = from()
    const result = step(before, { type: 'reopen' })

    expect(result.state.view).toEqual({ status: 'opening', frame: staleness })
    expect(result.state.gen).toBe(before.gen + 1)
    expect(result.effects.filter((effect) => effect.type === 'open_session')).toEqual([{ type: 'open_session', gen: before.gen + 1 }])
  })

  it('error(retry, none) + reopen → opening(none)', () => {
    const before = step(loading(), frame('session_expired')).state
    const result = step(before, { type: 'reopen' })

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
  })

  it.each([
    ['reconnect', { status: 422, code: 'reauth_required' }],
    ['checkout', { status: 422, code: 'subscription_required' }],
    ['reload', { status: 419, code: null }],
    ['null', { status: 422, code: 'official_number_unsupported' }],
  ])('error(%s) + reopen does nothing (S22)', (_, refusal) => {
    const before = step(opening(), { type: 'session_refused', gen: 0, refusal }).state
    const result = step(before, { type: 'reopen' })

    expect(result.state).toBe(before)
    expect(result.effects).toEqual([])
  })

  it('reopen discards the pending answer of the previous request', () => {
    const reopened = step(opening(), { type: 'reopen' }).state
    const late = step(reopened, opened(0))

    expect(late.state).toBe(reopened)
    expect(late.effects).toEqual([])
  })

  it('error + retry → opening(none), unmount_iframe, open_session with gen++', () => {
    const before = timedOut()
    const result = step(before, { type: 'retry' })

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'open_session', gen: before.gen + 1 }, { type: 'notify' }])
  })

  it.each(['opening', 'loading', 'ready'] as const)('retry outside an error does nothing (%s)', (name) => {
    const before = { opening, loading, ready }[name]()

    expect(step(before, { type: 'retry' }).effects).toEqual([])
  })

  it.each([
    ['loading', loading],
    ['ready', ready],
    ['error(loading)', timedOut],
  ] as const)('%s + resize → emit_resize', (_, from) => {
    const result = step(from(), { type: 'iframe', message: { type: 'resize', height: 612 } })

    expect(result.effects).toEqual([{ type: 'emit_resize', height: 612 }])
  })

  it('error(none) ignores the resize of the end screen', () => {
    const ended = step(ready(), frame('session_revoked')).state

    expect(step(ended, { type: 'iframe', message: { type: 'resize', height: 612 } }).effects).toEqual([])
  })

  it('ready + message_sent → emit_message_sent', () => {
    const result = step(ready(), { type: 'iframe', message: { type: 'message_sent', message_id: 'wamid.1' } })

    expect(result.effects).toEqual([{ type: 'emit_message_sent', message_id: 'wamid.1' }])
  })

  it('loading ignores message_sent', () => {
    expect(step(loading(), { type: 'iframe', message: { type: 'message_sent', message_id: 1 } }).effects).toEqual([])
  })

  it('ignores session_replaced, which only the inbox sends', () => {
    const before = ready()

    expect(step(before, frame('session_replaced')).state).toBe(before)
  })

  it('ready + ready does nothing', () => {
    const before = ready()

    expect(step(before, frame('ready'))).toEqual({ state: before, effects: [] })
  })

  it.each(['logout', 'destroy'] as const)('any state + %s → closed, clear_ready_timeout, unmount_iframe, gen++', (type) => {
    for (const from of [initialState, opening, loading, ready, timedOut]) {
      const before = from()
      const result = step(before, { type })

      expect(result.state.view).toEqual({ status: 'closed', frame: 'none' })
      expect(result.state.gen).toBe(before.gen + 1)
      expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'notify' }])
    }
  })

  it('closed ignores everything, including a late session (S14)', () => {
    const closed = step(opening(), { type: 'destroy' }).state

    for (const event of [opened(0), opened(1), { type: 'retry' }, { type: 'reopen' }, frame('ready'), { type: 'start' }] as ConversationEvent[]) {
      expect(step(closed, event)).toEqual({ state: closed, effects: [] })
    }
  })

  it('discards a ready_timeout of an older gen', () => {
    const before = step(reopening(), opened(1, URL_B)).state

    expect(step(before, { type: 'ready_timeout', gen: 1 }).state).toBe(before)
  })

  it('discards a ready_timeout after ready', () => {
    const before = ready()

    expect(step(before, { type: 'ready_timeout', gen: 1 }).state).toBe(before)
  })
})

describe('conversation machine — scenarios', () => {
  it('S3: no event after mount → error(ready_timeout) with the iframe alive, then the late ready wins', () => {
    const late = step(timedOut(), frame('ready')).state

    expect(timedOut().view).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
    expect(late.view).toEqual({ status: 'ready', frame: 'live' })
  })

  it('S24: refusal after the automatic reopening unmounts the old iframe', () => {
    const result = step(reopening(), { type: 'session_refused', gen: 1, refusal: { status: 503, code: 'unavailable' } })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'unavailable', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('S22: theme change while ready reopens over the stale iframe', () => {
    expect(step(ready(), { type: 'reopen' }).state.view).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('keeps no state of its own outside the value it returns', () => {
    const before = loading()
    const copy = structuredClone(before)

    step(before, frame('ready'))

    expect(before).toEqual(copy)
  })

  it('touches no DOM, timer or storage', () => {
    const source = readFileSync(new URL('../../src/machine/conversation.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/\b(window|document|setTimeout|setInterval|sessionStorage|localStorage|Date\.now)\b/)
  })
})
