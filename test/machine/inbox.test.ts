import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { initialState } from '../../src/machine/inbox'
import type { InboxEvent } from '../../src/machine/inbox'
import {
  HIDE,
  NOTHING_STORED,
  NOW,
  ORIGIN,
  RESUME_A,
  SHOW,
  START,
  START_A,
  START_B,
  STORED,
  STORED_READ,
  UNTIL,
  frame,
  freshLoading,
  freshOpening,
  freshReady,
  freshTimedOut,
  opened,
  resumeLoading,
  resumeReady,
  resumeTimedOut,
  step,
  through,
} from './inbox-support'

describe('inbox machine — table', () => {
  it('idle + start → idle, forget_other_resumes, read_resume', () => {
    const result = step(initialState({ resumable: true, visible: true }), START)

    expect(result.state.view).toEqual({ status: 'idle', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'forget_other_resumes' }, { type: 'read_resume' }])
  })

  it('idle + resume_read(entry) → loading(resume), mount_iframe, arm_ready_timeout', () => {
    const result = step(through([START]), STORED_READ)

    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
    expect(result.state.via).toBe('resume')
    expect(result.state.ownResumeUrl).toBe(STORED.url)
    expect(result.effects).toEqual([{ type: 'mount_iframe', url: STORED.url, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: 1 }, { type: 'notify' }])
  })

  it('idle + resume_read(null) → opening(none, fresh), open_session', () => {
    const result = step(through([START]), NOTHING_STORED)

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.state.via).toBe('fresh')
    expect(result.effects).toEqual([{ type: 'open_session', gen: 0 }, { type: 'notify' }])
  })

  it('without a person, start opens a fresh session and touches no storage', () => {
    const result = step(initialState({ resumable: false, visible: true }), START)

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'open_session', gen: 0 }, { type: 'notify' }])
  })

  it('opening + session_opened → loading(fresh) with pendingResume', () => {
    const result = step(freshOpening(), opened(0))

    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
    expect(result.state.pendingResume).toEqual({ url: RESUME_A, origin: ORIGIN, until: UNTIL })
    expect(result.effects).toEqual([{ type: 'mount_iframe', url: START_A, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: 1 }, { type: 'notify' }])
  })

  it('opening(stale) + session_opened → unmount_iframe first', () => {
    const reopening = step(freshReady(), frame('session_expired')).state
    const result = step(reopening, opened(1, START_B))

    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'mount_iframe', url: START_B, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: 2 }, { type: 'notify' }])
  })

  it('session_opened without resume_url or resume_until leaves no pendingResume', () => {
    expect(step(freshOpening(), opened(0, START_A, null)).state.pendingResume).toBeNull()
  })

  it.each([
    ['visible, retry action', true, { status: 503, code: 'unavailable' }, 'unavailable', 'retry', false],
    ['hidden, retry action', false, { status: null, code: null }, 'unavailable', 'retry', true],
    ['hidden, rate limited', false, { status: 429, code: 'rate_limited' }, 'rate_limited', 'retry', true],
    ['hidden, reconnect action', false, { status: 422, code: 'reauth_required' }, 'reauth_required', 'reconnect', false],
    ['hidden, subscription', false, { status: 422, code: 'subscription_required' }, 'subscription_required', 'checkout', false],
  ] as const)('opening + session_refused (%s) → error(code, none), retryOnShow = %p', (_, visible, refusal, code, action, retryOnShow) => {
    const result = step(freshOpening(visible), { type: 'session_refused', gen: 0, refusal })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code, action })
    expect(result.state.retryOnShow).toBe(retryOnShow)
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it.each(['ready', 'session_expired', 'session_replaced', 'session_revoked'] as const)('opening ignores %s (F11)', (type) => {
    const before = freshOpening()

    expect(step(before, frame(type))).toEqual({ state: before, effects: [] })
  })

  it('loading + ready → ready, clear_ready_timeout, remember_resume, ownResumeUrl = pendingResume.url', () => {
    const result = step(freshLoading(), frame('ready'))

    expect(result.state.view).toEqual({ status: 'ready', frame: 'live' })
    expect(result.state.ownResumeUrl).toBe(RESUME_A)
    expect(result.state.pendingResume).toBeNull()
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'remember_resume', entry: { url: RESUME_A, origin: ORIGIN, until: UNTIL } }, { type: 'notify' }])
  })

  it('loading + ready without pendingResume remembers nothing', () => {
    const before = through([START, NOTHING_STORED, opened(0, START_A, null)])

    expect(step(before, frame('ready')).effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'notify' }])
  })

  it.each([
    ['loading', resumeLoading],
    ['error(loading)', resumeTimedOut],
  ] as const)('%s via resume + session_expired → opening(none, fresh), forget own entry, open_session', (_, from) => {
    const before = from()
    const result = step(before, frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.state.via).toBe('fresh')
    expect(result.state.ownResumeUrl).toBeNull()
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'forget_resume_if', url: STORED.url }, { type: 'unmount_iframe' }, { type: 'open_session', gen: before.gen }, { type: 'notify' }])
  })

  it.each([
    ['loading', resumeLoading],
    ['error(loading)', resumeTimedOut],
  ] as const)('%s via resume + session_replaced → H1 (read_resume)', (_, from) => {
    const result = step(from(), frame('session_replaced'))

    expect(result.state.reading).toBe('replaced')
    expect(result.effects).toEqual([{ type: 'read_resume' }])
  })

  it.each([
    [true, false],
    [false, true],
  ])('loading via fresh + session_expired (visible = %p) → error(session_expired, none), retryOnShow = %p', (visible, retryOnShow) => {
    const result = step(freshLoading(visible), frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
    expect(result.state.retryOnShow).toBe(retryOnShow)
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('error(loading) via fresh + session_expired → error(session_expired, none)', () => {
    const result = step(freshTimedOut(), frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
  })

  it.each([
    ['session_revoked', 'retry', freshLoading, []],
    ['subscription_required', 'checkout', freshLoading, []],
    ['session_replaced', 'retry', freshLoading, []],
    ['session_revoked', 'retry', resumeLoading, [{ type: 'forget_resume_if', url: STORED.url }]],
    ['subscription_required', 'checkout', resumeTimedOut, [{ type: 'forget_resume_if', url: STORED.url }]],
  ] as const)('before ready + %s → error(code, none) without retryOnShow', (type, action, from, forget) => {
    const result = step(from(false), frame(type))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: type, action })
    expect(result.state.retryOnShow).toBe(false)
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, ...forget, { type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it.each([
    [true, false],
    [false, true],
  ])('loading + ready_timeout (visible = %p) → error(ready_timeout, loading), retryOnShow = %p, pendingResume = null', (visible, retryOnShow) => {
    const result = step(freshLoading(visible), { type: 'ready_timeout', gen: 1 })

    expect(result.state.view).toEqual({ status: 'error', frame: 'loading', code: 'ready_timeout', action: 'retry' })
    expect(result.state.retryOnShow).toBe(retryOnShow)
    expect(result.state.pendingResume).toBeNull()
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it('loading via resume + ready_timeout forgets the own entry', () => {
    expect(step(resumeLoading(), { type: 'ready_timeout', gen: 1 }).effects).toEqual([{ type: 'forget_resume_if', url: STORED.url }, { type: 'notify' }])
  })

  it('error(loading) + ready → ready, retryOnShow = false, remembers nothing (S13)', () => {
    const result = step(freshTimedOut(false), frame('ready'))

    expect(result.state.view).toEqual({ status: 'ready', frame: 'live' })
    expect(result.state.retryOnShow).toBe(false)
    expect(result.effects).toEqual([{ type: 'notify' }])
  })

  it('ready + ready does nothing', () => {
    const before = freshReady()

    expect(step(before, frame('ready'))).toEqual({ state: before, effects: [] })
  })

  it('ready, visible + session_expired, never reopened → opening(stale, fresh), forget own entry, open_session', () => {
    const result = step(freshReady(), frame('session_expired'))

    expect(result.state.view).toEqual({ status: 'opening', frame: 'stale' })
    expect(result.state.lastAutoReopenAt).toBe(NOW)
    expect(result.effects).toEqual([{ type: 'forget_resume_if', url: RESUME_A }, { type: 'open_session', gen: 1 }, { type: 'notify' }])
  })

  it('ready, visible + session_expired < 60 s after the last reopening → error(inbox_expired, none)', () => {
    const reopened = step(freshReady(), frame('session_expired')).state
    const readyAgain = [opened(1, START_B, null), frame('ready')].reduce((state, event) => step(state, event).state, reopened)
    const result = step(readyAgain, frame('session_expired'), NOW + 59_999)

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'inbox_expired', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('ready, visible + session_expired ≥ 60 s after the last reopening → reopens again', () => {
    const reopened = step(freshReady(), frame('session_expired')).state
    const readyAgain = [opened(1, START_B, null), frame('ready')].reduce((state, event) => step(state, event).state, reopened)

    expect(step(readyAgain, frame('session_expired'), NOW + 60_000).state.view).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('ready, hidden + session_expired → stays ready, reopenOnShow, forget own entry', () => {
    const before = freshReady(false)
    const result = step(before, frame('session_expired'))

    expect(result.state.view).toBe(before.view)
    expect(result.state.reopenOnShow).toBe(true)
    expect(result.effects).toEqual([{ type: 'forget_resume_if', url: RESUME_A }])
  })

  it.each([
    ['session_revoked', 'retry'],
    ['subscription_required', 'checkout'],
    ['session_replaced', 'retry'],
  ] as const)('ready + %s → error(code, none), forget own entry, unmount_iframe', (type, action) => {
    const result = step(freshReady(), frame(type))

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: type, action })
    expect(result.effects).toEqual([{ type: 'forget_resume_if', url: RESUME_A }, { type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('visible{true} with reopenOnShow → opening(stale, fresh), open_session, lastAutoReopenAt = now', () => {
    const expired = step(freshReady(false), frame('session_expired')).state
    const result = step(expired, SHOW, NOW + 5_000)

    expect(result.state.view).toEqual({ status: 'opening', frame: 'stale' })
    expect(result.state.lastAutoReopenAt).toBe(NOW + 5_000)
    expect(result.effects).toEqual([{ type: 'open_session', gen: 1 }, { type: 'notify' }])
  })

  it('visible{true} on an error with retryOnShow → opening(none, fresh), unmount_iframe, open_session', () => {
    const failed = freshTimedOut(false)
    const result = step(failed, SHOW)

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'open_session', gen: 1 }, { type: 'notify' }])
  })

  it('visible{true} on an error without retryOnShow does nothing but remember visibility', () => {
    const failed = step(freshReady(false), frame('session_revoked')).state
    const result = step(failed, SHOW)

    expect(result.state.view).toBe(failed.view)
    expect(result.state.visible).toBe(true)
    expect(result.effects).toEqual([])
  })

  it('visible{false} only records visibility', () => {
    const result = step(freshReady(), HIDE)

    expect(result.state.visible).toBe(false)
    expect(result.effects).toEqual([])
  })

  it('error(session_replaced) + retry → H2 (read_resume), gen++', () => {
    const replaced = step(freshReady(), frame('session_replaced')).state
    const result = step(replaced, { type: 'retry' })

    expect(result.state.gen).toBe(replaced.gen + 1)
    expect(result.state.reading).toBe('retry')
    expect(result.effects).toEqual([{ type: 'read_resume' }])
  })

  it('error(other) + retry → opening(none, fresh), unmount_iframe, open_session with gen++', () => {
    const failed = freshTimedOut()
    const result = step(failed, { type: 'retry' })

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'open_session', gen: failed.gen + 1 }, { type: 'notify' }])
  })

  it('ready, visible + keepalive_tick → keep_alive', () => {
    expect(step(freshReady(), { type: 'keepalive_tick' }).effects).toEqual([{ type: 'keep_alive' }])
  })

  it.each([
    ['hidden', () => freshReady(false)],
    ['loading', () => freshLoading()],
    ['in error', () => freshTimedOut()],
    ['opening', () => freshOpening()],
  ])('keepalive_tick while %s does nothing', (_, from) => {
    expect(step(from(), { type: 'keepalive_tick' }).effects).toEqual([])
  })

  it.each([401, 419])('any state + keepalive_failed %i → closed, forget_all_resumes', (status) => {
    for (const from of [freshOpening, freshLoading, freshReady, resumeLoading, freshTimedOut]) {
      const before = from()
      const result = step(before, { type: 'keepalive_failed', status })

      expect(result.state.view).toEqual({ status: 'closed', frame: 'none' })
      expect(result.state.gen).toBe(before.gen + 1)
      expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'forget_all_resumes' }, { type: 'notify' }])
    }
  })

  it.each([500, 0, 403])('keepalive_failed %i is ignored', (status) => {
    const before = freshReady()

    expect(step(before, { type: 'keepalive_failed', status })).toEqual({ state: before, effects: [] })
  })

  it('any state + logout → closed, forget_all_resumes', () => {
    for (const from of [freshOpening, freshLoading, freshReady, resumeLoading]) {
      const result = step(from(), { type: 'logout' })

      expect(result.state.view).toEqual({ status: 'closed', frame: 'none' })
      expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'forget_all_resumes' }, { type: 'notify' }])
    }
  })

  it('any state + destroy → closed, the entry stays', () => {
    for (const from of [freshOpening, freshLoading, freshReady, resumeReady]) {
      const result = step(from(), { type: 'destroy' })

      expect(result.state.view).toEqual({ status: 'closed', frame: 'none' })
      expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }, { type: 'notify' }])
    }
  })

  it('closed ignores everything', () => {
    const closed = step(freshOpening(), { type: 'destroy' }).state
    const events: InboxEvent[] = [opened(0), opened(1), { type: 'retry' }, SHOW, frame('ready'), START, { type: 'keepalive_tick' }, { type: 'logout' }]

    for (const event of events) {
      expect(step(closed, event)).toEqual({ state: closed, effects: [] })
    }
  })

  it('discards session_opened and session_refused of an older gen', () => {
    const failed = step(freshOpening(), { type: 'session_refused', gen: 0, refusal: { status: 503, code: 'unavailable' } }).state
    const retrying = step(failed, { type: 'retry' }).state

    expect(step(retrying, opened(0)).state).toBe(retrying)
    expect(step(retrying, { type: 'session_refused', gen: 0, refusal: { status: 503, code: 'unavailable' } }).state).toBe(retrying)
  })

  it('discards a ready_timeout of an older gen', () => {
    const before = freshLoading()

    expect(step(before, { type: 'ready_timeout', gen: 0 }).state).toBe(before)
  })

  it('without a person, emits no storage effect at all', () => {
    const events: InboxEvent[] = [START, opened(0), frame('ready'), frame('session_revoked'), { type: 'retry' }, opened(1), { type: 'logout' }]
    let state = initialState({ resumable: false, visible: true })
    const emitted: string[] = []

    for (const event of events) {
      const result = step(state, event)

      state = result.state
      emitted.push(...result.effects.map((effect) => effect.type))
    }

    expect(emitted.filter((type) => type.includes('resume'))).toEqual([])
  })

  it('touches no DOM, timer or storage', () => {
    const source = readFileSync(new URL('../../src/machine/inbox.ts', import.meta.url), 'utf8')

    expect(source).not.toMatch(/\b(window|document|setTimeout|setInterval|sessionStorage|localStorage|Date\.now)\b/)
  })
})
