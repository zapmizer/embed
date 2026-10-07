import { describe, expect, it } from 'bun:test'
import { initialState } from '../../src/machine/inbox'
import type { InboxEvent, InboxMachine } from '../../src/machine/inbox'
import {
  HIDE,
  NOTHING_STORED,
  NOW,
  ORIGIN,
  OTHER_TAB,
  RESUME_A,
  SHOW,
  START,
  START_B,
  STORED,
  STORED_READ,
  frame,
  freshLoading,
  freshOpening,
  freshReady,
  opened,
  resumeLoading,
  resumeTimedOut,
  step,
  through,
} from './inbox-support'

function after(state: InboxMachine, events: InboxEvent[]): InboxMachine {
  return events.reduce((current, event) => step(current, event).state, state)
}

describe('H1 — resume receives session_replaced before ready', () => {
  it('loads the entry another tab wrote, once', () => {
    const reading = step(resumeLoading(), frame('session_replaced')).state
    const result = step(reading, { type: 'resume_read', entry: OTHER_TAB })

    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
    expect(result.state.ownResumeUrl).toBe(OTHER_TAB.url)
    expect(result.state.resumeHopUsed).toBe(true)
    expect(result.effects).toEqual([
      { type: 'clear_ready_timeout' },
      { type: 'unmount_iframe' },
      { type: 'mount_iframe', url: OTHER_TAB.url, origin: ORIGIN },
      { type: 'arm_ready_timeout', gen: 2 },
      { type: 'notify' },
    ])
  })

  it('shows the error when the stored entry is still its own', () => {
    const reading = step(resumeLoading(), frame('session_replaced')).state
    const result = step(reading, { type: 'resume_read', entry: STORED })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'clear_ready_timeout' }, { type: 'forget_resume_if', url: STORED.url }, { type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('shows the error when nothing is stored', () => {
    const reading = step(resumeTimedOut(), frame('session_replaced')).state

    expect(step(reading, NOTHING_STORED).state.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
  })

  it('hops only once: a second session_replaced on the hopped entry ends in error', () => {
    const hopped = after(resumeLoading(), [frame('session_replaced'), { type: 'resume_read', entry: OTHER_TAB }, frame('session_replaced')])
    const result = step(hopped, { type: 'resume_read', entry: { ...STORED, url: `${ORIGIN}/chats?embed_inbox=third` } })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
    expect(result.state.retryOnShow).toBe(false)
  })
})

describe('H2 — button after session_replaced', () => {
  it('loads the entry of the other tab without a new session', () => {
    const replaced = step(freshReady(), frame('session_replaced')).state
    const reading = step(replaced, { type: 'retry' }).state
    const result = step(reading, { type: 'resume_read', entry: OTHER_TAB })

    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
    expect(result.state.via).toBe('resume')
    expect(result.effects).toEqual([{ type: 'mount_iframe', url: OTHER_TAB.url, origin: ORIGIN }, { type: 'arm_ready_timeout', gen: reading.gen + 1 }, { type: 'notify' }])
  })

  it('opens a fresh session when the stored entry is its own or missing', () => {
    const replaced = step(freshReady(), frame('session_replaced')).state
    const reading = step(replaced, { type: 'retry' }).state

    for (const entry of [null, { ...OTHER_TAB, url: RESUME_A }]) {
      const result = step(reading, { type: 'resume_read', entry })

      expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
      expect(result.effects).toEqual([{ type: 'open_session', gen: reading.gen }, { type: 'notify' }])
    }
  })

  it('without a person, opens a fresh session directly', () => {
    const replaced = after(initialState({ resumable: false, visible: true }), [START, opened(0, START_B, null), frame('ready'), frame('session_replaced')])
    const result = step(replaced, { type: 'retry' })

    expect(result.state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.effects).toEqual([{ type: 'open_session', gen: replaced.gen + 1 }, { type: 'notify' }])
  })
})

describe('inbox machine — scenarios', () => {
  it('S1: two tabs — A loses the inbox, forgets its own entry, and only the button opens one new session', () => {
    const replaced = step(freshReady(), frame('session_replaced'))

    expect(replaced.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
    expect(replaced.effects).toContainEqual({ type: 'forget_resume_if', url: RESUME_A })
    expect(step(replaced.state, SHOW).effects).toEqual([])

    const reading = step(replaced.state, { type: 'retry' }).state

    expect(step(reading, NOTHING_STORED).effects).toEqual([{ type: 'open_session', gen: reading.gen }, { type: 'notify' }])
  })

  it('S2: cookie dropped on a fresh inbox → error(session_expired, retry)', () => {
    expect(step(freshLoading(), frame('session_expired')).state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
  })

  it('S2/S9: cookie dropped or resume expired on the server → one new session, then the same error', () => {
    const renewed = step(resumeLoading(), frame('session_expired')).state
    const loadingAgain = step(renewed, opened(renewed.gen)).state
    const result = step(loadingAgain, frame('session_expired'))

    expect(renewed.view).toEqual({ status: 'opening', frame: 'none' })
    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'session_expired', action: 'retry' })
    expect(result.effects.filter((effect) => effect.type === 'open_session')).toEqual([])
  })

  it('S5: hidden inbox expires → no request until shown, then reopens over the stale iframe', () => {
    const expired = step(freshReady(false), frame('session_expired'))

    expect(expired.effects.filter((effect) => effect.type === 'open_session')).toEqual([])
    expect(step(expired.state, SHOW).state.view).toEqual({ status: 'opening', frame: 'stale' })
  })

  it('S6: visible inbox expires twice within a minute → second time shows inbox_expired', () => {
    const first = step(freshReady(), frame('session_expired')).state
    const readyAgain = after(first, [opened(first.gen, START_B), frame('ready')])

    expect(step(readyAgain, frame('session_expired'), NOW + 30_000).state.view).toEqual({ status: 'error', frame: 'none', code: 'inbox_expired', action: 'retry' })
  })

  it('S7/S23: another tab opens later → error(session_replaced) with the button, never by itself', () => {
    const replaced = step(freshReady(), frame('session_replaced')).state

    expect(replaced.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
    expect(replaced.retryOnShow).toBe(false)
    expect(replaced.reopenOnShow).toBe(false)
  })

  it('S8: reload with a stored entry → loading(resume) without a request', () => {
    const result = step(through([START]), STORED_READ)

    expect(result.effects.filter((effect) => effect.type === 'open_session')).toEqual([])
    expect(result.state.view).toEqual({ status: 'loading', frame: 'loading' })
  })

  it('S13: late ready after the timeout → ready, entry not written', () => {
    const late = step(through([START, NOTHING_STORED, opened(0), { type: 'ready_timeout', gen: 1 }]), frame('ready'))

    expect(late.state.view).toEqual({ status: 'ready', frame: 'live' })
    expect(late.effects.filter((effect) => effect.type === 'remember_resume')).toEqual([])
  })

  it('S18: both tabs reopen together and this one loses → error(session_replaced)', () => {
    const reopening = step(freshReady(), frame('session_expired')).state
    const loadingNew = step(reopening, opened(reopening.gen, START_B)).state

    expect(step(loadingNew, frame('session_replaced')).state.view).toEqual({ status: 'error', frame: 'none', code: 'session_replaced', action: 'retry' })
  })

  it('S19: end after the timeout — via resume one new session, via fresh error(session_expired, none)', () => {
    expect(step(resumeTimedOut(), frame('session_expired')).state.view).toEqual({ status: 'opening', frame: 'none' })
    expect(step(through([START, NOTHING_STORED, opened(0), { type: 'ready_timeout', gen: 1 }]), frame('session_expired')).state.view).toEqual({
      status: 'error',
      frame: 'none',
      code: 'session_expired',
      action: 'retry',
    })
  })

  it.each(['session_replaced', 'session_revoked'] as const)('S20: hidden inbox gets %s, then shows → stays in error', (type) => {
    const failed = step(freshReady(false), frame(type)).state
    const shown = step(failed, SHOW)

    expect(shown.state.view).toBe(failed.view)
    expect(shown.effects).toEqual([])
  })

  it('S21: keepalive 401 while reopening → closed, the late session is discarded', () => {
    const reopening = step(freshReady(), frame('session_expired')).state
    const closed = step(reopening, { type: 'keepalive_failed', status: 401 }).state

    expect(closed.view).toEqual({ status: 'closed', frame: 'none' })
    expect(step(closed, opened(reopening.gen))).toEqual({ state: closed, effects: [] })
  })

  it('S24: refusal after the automatic reopening unmounts the stale iframe', () => {
    const reopening = step(freshReady(), frame('session_expired')).state
    const result = step(reopening, { type: 'session_refused', gen: reopening.gen, refusal: { status: 503, code: 'unavailable' } })

    expect(result.state.view).toEqual({ status: 'error', frame: 'none', code: 'unavailable', action: 'retry' })
    expect(result.effects).toEqual([{ type: 'unmount_iframe' }, { type: 'notify' }])
  })

  it('tries again by itself only once after failing while hidden', () => {
    const failed = step(freshOpening(false), { type: 'session_refused', gen: 0, refusal: { status: null, code: null } }).state
    const retried = step(failed, SHOW).state
    const failedAgain = after(retried, [HIDE, { type: 'session_refused', gen: retried.gen, refusal: { status: 503, code: 'unavailable' } }])
    const shownWhileVisibleFailure = after(failed, [SHOW, { type: 'session_refused', gen: retried.gen, refusal: { status: 503, code: 'unavailable' } }, HIDE])

    expect(step(failedAgain, SHOW).effects.filter((effect) => effect.type === 'open_session')).toHaveLength(1)
    expect(step(shownWhileVisibleFailure, SHOW).effects).toEqual([])
  })

  it('a double click on the button asks for one session only', () => {
    const replaced = step(freshReady(), frame('session_replaced')).state
    const firstClick = after(replaced, [{ type: 'retry' }, NOTHING_STORED])
    const secondClick = step(firstClick, { type: 'retry' })

    expect(secondClick).toEqual({ state: firstClick, effects: [] })
  })
})
