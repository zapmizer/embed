import { codeForRefusal } from '../errors'
import type { EmbedEndType, EmbedMessage } from '../messages'
import type { MachineView, SessionOpened, SessionRefused } from '../state'
import { canAutoReopen, failed } from './view'

export function initialState(): ConversationMachine {
  return { view: { status: 'idle', frame: 'none' }, gen: 0, lastAutoReopenAt: null }
}

export function transition(state: ConversationMachine, event: ConversationEvent, ctx: { now: number }): ConversationStep {
  const step = decide(state, event, ctx.now)

  return step.state.view === state.view ? step : { state: step.state, effects: [...step.effects, { type: 'notify' }] }
}

function decide(state: ConversationMachine, event: ConversationEvent, now: number): ConversationStep {
  if (state.view.status === 'closed') {
    return stay(state)
  }

  if (event.type === 'logout' || event.type === 'destroy') {
    return {
      state: { ...state, gen: state.gen + 1, view: { status: 'closed', frame: 'none' } },
      effects: [{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }],
    }
  }

  if (event.type === 'start') {
    return state.view.status === 'idle' ? opening(state, 'none') : stay(state)
  }

  if (event.type === 'session_opened') {
    return sessionOpened(state, event.gen, event.session)
  }

  if (event.type === 'session_refused') {
    return sessionRefused(state, event.gen, event.refusal)
  }

  if (event.type === 'ready_timeout') {
    return readyTimeout(state, event.gen)
  }

  if (event.type === 'retry') {
    return retry(state)
  }

  if (event.type === 'reopen') {
    return reopen(state)
  }

  return fromFrame(state, event.message, now)
}

function opening(state: ConversationMachine, frame: 'none' | 'stale', before: ConversationEffect[] = []): ConversationStep {
  return {
    state: { ...state, view: { status: 'opening', frame } },
    effects: [...before, { type: 'open_session', gen: state.gen }],
  }
}

function sessionOpened(state: ConversationMachine, gen: number, session: SessionOpened): ConversationStep {
  if (state.view.status !== 'opening' || gen !== state.gen) {
    return stay(state)
  }

  const next = state.gen + 1
  const before: ConversationEffect[] = state.view.frame === 'stale' ? [{ type: 'unmount_iframe' }] : []

  return {
    state: { ...state, gen: next, view: { status: 'loading', frame: 'loading' } },
    effects: [...before, { type: 'mount_iframe', url: session.url, origin: session.origin }, { type: 'arm_ready_timeout', gen: next }],
  }
}

function sessionRefused(state: ConversationMachine, gen: number, refusal: SessionRefused): ConversationStep {
  if (state.view.status !== 'opening' || gen !== state.gen) {
    return stay(state)
  }

  return {
    state: { ...state, view: failed(codeForRefusal(refusal), 'none', refusal.retryAfter) },
    effects: state.view.frame === 'stale' ? [{ type: 'unmount_iframe' }] : [],
  }
}

function readyTimeout(state: ConversationMachine, gen: number): ConversationStep {
  if (state.view.status !== 'loading' || gen !== state.gen) {
    return stay(state)
  }

  return { state: { ...state, view: failed('ready_timeout', 'loading') }, effects: [] }
}

function retry(state: ConversationMachine): ConversationStep {
  if (state.view.status !== 'error') {
    return stay(state)
  }

  return opening({ ...state, gen: state.gen + 1 }, 'none', [{ type: 'unmount_iframe' }])
}

function reopen(state: ConversationMachine): ConversationStep {
  const view = state.view
  const reopenable = view.status === 'opening' || view.status === 'loading' || view.status === 'ready' || (view.status === 'error' && view.action === 'retry')

  if (!reopenable) {
    return stay(state)
  }

  return opening({ ...state, gen: state.gen + 1 }, view.frame === 'none' ? 'none' : 'stale')
}

function fromFrame(state: ConversationMachine, message: EmbedMessage, now: number): ConversationStep {
  const view = state.view
  const framed = view.status === 'loading' || (view.status === 'error' && view.frame === 'loading')

  if (message.type === 'resize') {
    return framed || view.status === 'ready' ? { state, effects: [{ type: 'emit_resize', height: message.height }] } : stay(state)
  }

  if (message.type === 'message_sent') {
    return view.status === 'ready' ? { state, effects: [{ type: 'emit_message_sent', message_id: message.message_id }] } : stay(state)
  }

  if (message.type === 'ready') {
    if (!framed) {
      return stay(state)
    }

    return {
      state: { ...state, view: { status: 'ready', frame: 'live' } },
      effects: view.status === 'loading' ? [{ type: 'clear_ready_timeout' }] : [],
    }
  }

  if (message.type === 'session_replaced') {
    return stay(state)
  }

  if (framed) {
    return ended(state, message.type, view.status === 'loading' ? [{ type: 'clear_ready_timeout' }] : [])
  }

  if (view.status !== 'ready') {
    return stay(state)
  }

  if (message.type === 'session_expired' && canAutoReopen(state.lastAutoReopenAt, now)) {
    return opening({ ...state, lastAutoReopenAt: now }, 'stale')
  }

  return ended(state, message.type, [])
}

function ended(state: ConversationMachine, code: EmbedEndType, before: ConversationEffect[]): ConversationStep {
  return { state: { ...state, view: failed(code, 'none') }, effects: [...before, { type: 'unmount_iframe' }] }
}

function stay(state: ConversationMachine): ConversationStep {
  return { state, effects: [] }
}

export type ConversationMachine = { view: MachineView; gen: number; lastAutoReopenAt: number | null }

export type ConversationEvent =
  | { type: 'start' }
  | { type: 'session_opened'; gen: number; session: SessionOpened }
  | { type: 'session_refused'; gen: number; refusal: SessionRefused }
  | { type: 'iframe'; message: EmbedMessage }
  | { type: 'ready_timeout'; gen: number }
  | { type: 'retry' }
  | { type: 'reopen' }
  | { type: 'logout' }
  | { type: 'destroy' }

export type ConversationEffect =
  | { type: 'open_session'; gen: number }
  | { type: 'mount_iframe'; url: string; origin: string }
  | { type: 'unmount_iframe' }
  | { type: 'arm_ready_timeout'; gen: number }
  | { type: 'clear_ready_timeout' }
  | { type: 'emit_resize'; height: number }
  | { type: 'emit_message_sent'; message_id: string | number }
  | { type: 'notify' }

export type ConversationStep = { state: ConversationMachine; effects: ConversationEffect[] }
