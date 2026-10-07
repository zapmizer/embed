import { actionFor, codeForRefusal } from '../errors'
import type { EmbedEndType, EmbedMessage } from '../messages'
import type { ResumeEntry } from '../resume'
import type { MachineView, SessionOpened, SessionRefused } from '../state'
import { canAutoReopen, failed } from './view'

const RESUME_EFFECTS: ReadonlySet<string> = new Set(['read_resume', 'remember_resume', 'forget_resume_if', 'forget_other_resumes', 'forget_all_resumes'])

export function initialState(options: { resumable: boolean; visible: boolean }): InboxMachine {
  return {
    view: { status: 'idle', frame: 'none' },
    gen: 0,
    resumable: options.resumable,
    via: 'fresh',
    ownResumeUrl: null,
    pendingResume: null,
    lastAutoReopenAt: null,
    visible: options.visible,
    reopenOnShow: false,
    retryOnShow: false,
    resumeHopUsed: false,
    reading: null,
  }
}

export function transition(state: InboxMachine, event: InboxEvent, ctx: { now: number }): InboxStep {
  const step = decide(state, event, ctx.now)
  const effects = state.resumable ? step.effects : step.effects.filter((effect) => !RESUME_EFFECTS.has(effect.type))

  return { state: step.state, effects: step.state.view === state.view ? effects : [...effects, { type: 'notify' }] }
}

function decide(state: InboxMachine, event: InboxEvent, now: number): InboxStep {
  if (state.view.status === 'closed') {
    return stay(state)
  }

  if (event.type === 'logout') {
    return close(state, true)
  }

  if (event.type === 'destroy') {
    return close(state, false)
  }

  if (event.type === 'keepalive_failed') {
    return event.status === 401 || event.status === 419 ? close(state, true) : stay(state)
  }

  if (event.type === 'start') {
    return start(state)
  }

  if (event.type === 'resume_read') {
    return resumeRead(state, event.entry)
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

  if (event.type === 'visible') {
    return visibility(state, event.value, now)
  }

  if (event.type === 'keepalive_tick') {
    return state.view.status === 'ready' && state.visible ? { state, effects: [{ type: 'keep_alive' }] } : stay(state)
  }

  return fromFrame(state, event.message, now)
}

function close(state: InboxMachine, forgetAll: boolean): InboxStep {
  const effects: InboxEffect[] = [{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }]

  return {
    state: { ...state, gen: state.gen + 1, view: { status: 'closed', frame: 'none' }, reading: null },
    effects: forgetAll ? [...effects, { type: 'forget_all_resumes' }] : effects,
  }
}

function start(state: InboxMachine): InboxStep {
  if (state.view.status !== 'idle') {
    return stay(state)
  }

  if (!state.resumable) {
    return openFresh(state, 'none', [])
  }

  return { state: { ...state, reading: 'start' }, effects: [{ type: 'forget_other_resumes' }, { type: 'read_resume' }] }
}

function resumeRead(state: InboxMachine, entry: ResumeEntry | null): InboxStep {
  if (state.reading === 'start') {
    return entry === null ? openFresh(state, 'none', []) : loadResume(state, entry, [], false)
  }

  if (state.reading === 'replaced') {
    if (entry !== null && entry.url !== state.ownResumeUrl && !state.resumeHopUsed) {
      return loadResume(state, entry, [{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }], true)
    }

    return {
      state: { ...state, view: failed('session_replaced', 'none'), pendingResume: null, retryOnShow: false, reading: null },
      effects: [{ type: 'clear_ready_timeout' }, ...forgetOwn(state), { type: 'unmount_iframe' }],
    }
  }

  if (state.reading === 'retry') {
    return entry !== null && entry.url !== state.ownResumeUrl ? loadResume(state, entry, [], state.resumeHopUsed) : openFresh(state, 'none', [])
  }

  return stay(state)
}

function openFresh(state: InboxMachine, frame: 'none' | 'stale', before: InboxEffect[]): InboxStep {
  return {
    state: {
      ...state,
      view: { status: 'opening', frame },
      via: 'fresh',
      ownResumeUrl: null,
      pendingResume: null,
      resumeHopUsed: false,
      reopenOnShow: false,
      retryOnShow: false,
      reading: null,
    },
    effects: [...before, { type: 'open_session', gen: state.gen }],
  }
}

function loadResume(state: InboxMachine, entry: ResumeEntry, before: InboxEffect[], resumeHopUsed: boolean): InboxStep {
  const gen = state.gen + 1

  return {
    state: {
      ...state,
      gen,
      view: { status: 'loading', frame: 'loading' },
      via: 'resume',
      ownResumeUrl: entry.url,
      pendingResume: null,
      resumeHopUsed,
      reopenOnShow: false,
      retryOnShow: false,
      reading: null,
    },
    effects: [...before, { type: 'mount_iframe', url: entry.url, origin: entry.origin }, { type: 'arm_ready_timeout', gen }],
  }
}

function sessionOpened(state: InboxMachine, gen: number, session: SessionOpened): InboxStep {
  if (state.view.status !== 'opening' || gen !== state.gen) {
    return stay(state)
  }

  const next = state.gen + 1
  const before: InboxEffect[] = state.view.frame === 'stale' ? [{ type: 'unmount_iframe' }] : []

  return {
    state: { ...state, gen: next, view: { status: 'loading', frame: 'loading' }, via: 'fresh', pendingResume: pendingResumeOf(session) },
    effects: [...before, { type: 'mount_iframe', url: session.url, origin: session.origin }, { type: 'arm_ready_timeout', gen: next }],
  }
}

function pendingResumeOf(session: SessionOpened): ResumeEntry | null {
  const url = session.resume_url
  const until = session.resume_until

  return typeof url === 'string' && url !== '' && typeof until === 'string' && until !== '' ? { url, origin: session.origin, until } : null
}

function sessionRefused(state: InboxMachine, gen: number, refusal: SessionRefused): InboxStep {
  if (state.view.status !== 'opening' || gen !== state.gen) {
    return stay(state)
  }

  const code = codeForRefusal(refusal)

  return {
    state: { ...state, view: failed(code, 'none', refusal.retryAfter), retryOnShow: !state.visible && actionFor(code) === 'retry' },
    effects: state.view.frame === 'stale' ? [{ type: 'unmount_iframe' }] : [],
  }
}

function readyTimeout(state: InboxMachine, gen: number): InboxStep {
  if (state.view.status !== 'loading' || gen !== state.gen) {
    return stay(state)
  }

  return {
    state: { ...state, view: failed('ready_timeout', 'loading'), pendingResume: null, retryOnShow: !state.visible },
    effects: forgetOwn(state),
  }
}

function retry(state: InboxMachine): InboxStep {
  const view = state.view

  if (view.status !== 'error') {
    return stay(state)
  }

  const next = { ...state, gen: state.gen + 1 }

  if (view.code !== 'session_replaced') {
    return openFresh(next, 'none', [{ type: 'unmount_iframe' }])
  }

  return next.resumable ? { state: { ...next, reading: 'retry' }, effects: [{ type: 'read_resume' }] } : openFresh(next, 'none', [])
}

function visibility(state: InboxMachine, visible: boolean, now: number): InboxStep {
  const next = { ...state, visible }

  if (visible && state.view.status === 'ready' && state.reopenOnShow) {
    return openFresh({ ...next, lastAutoReopenAt: now }, 'stale', [])
  }

  if (visible && state.view.status === 'error' && state.retryOnShow) {
    return openFresh(next, 'none', [{ type: 'unmount_iframe' }])
  }

  return { state: next, effects: [] }
}

function fromFrame(state: InboxMachine, message: EmbedMessage, now: number): InboxStep {
  const view = state.view
  const waiting = view.status === 'loading' || (view.status === 'error' && view.frame === 'loading')

  if (message.type === 'resize' || message.type === 'message_sent') {
    return stay(state)
  }

  if (message.type === 'ready') {
    return waiting ? becomeReady(state, view.status === 'loading') : stay(state)
  }

  if (waiting) {
    return endBeforeReady(state, message.type)
  }

  return view.status === 'ready' ? endAfterReady(state, message.type, now) : stay(state)
}

function becomeReady(state: InboxMachine, armed: boolean): InboxStep {
  const pending = state.pendingResume
  const effects: InboxEffect[] = armed ? [{ type: 'clear_ready_timeout' }] : []

  return {
    state: {
      ...state,
      view: { status: 'ready', frame: 'live' },
      ownResumeUrl: pending === null ? state.ownResumeUrl : pending.url,
      pendingResume: null,
      retryOnShow: false,
    },
    effects: pending === null ? effects : [...effects, { type: 'remember_resume', entry: pending }],
  }
}

function endBeforeReady(state: InboxMachine, type: EmbedEndType): InboxStep {
  if (state.via === 'resume' && type === 'session_expired') {
    return openFresh(state, 'none', [{ type: 'clear_ready_timeout' }, ...forgetOwn(state), { type: 'unmount_iframe' }])
  }

  if (state.via === 'resume' && type === 'session_replaced') {
    return { state: { ...state, reading: 'replaced' }, effects: [{ type: 'read_resume' }] }
  }

  if (type === 'session_expired') {
    return {
      state: { ...state, view: failed('session_expired', 'none'), pendingResume: null, retryOnShow: !state.visible },
      effects: [{ type: 'clear_ready_timeout' }, { type: 'unmount_iframe' }],
    }
  }

  return {
    state: { ...state, view: failed(type, 'none'), pendingResume: null, retryOnShow: false },
    effects: [{ type: 'clear_ready_timeout' }, ...forgetOwn(state), { type: 'unmount_iframe' }],
  }
}

function endAfterReady(state: InboxMachine, type: EmbedEndType, now: number): InboxStep {
  if (type === 'session_expired' && !state.visible) {
    return { state: { ...state, reopenOnShow: true }, effects: forgetOwn(state) }
  }

  if (type === 'session_expired' && canAutoReopen(state.lastAutoReopenAt, now)) {
    return openFresh({ ...state, lastAutoReopenAt: now }, 'stale', forgetOwn(state))
  }

  const code = type === 'session_expired' ? 'inbox_expired' : type

  return {
    state: { ...state, view: failed(code, 'none'), reopenOnShow: false, retryOnShow: false },
    effects: [...forgetOwn(state), { type: 'unmount_iframe' }],
  }
}

function forgetOwn(state: InboxMachine): InboxEffect[] {
  return state.ownResumeUrl === null ? [] : [{ type: 'forget_resume_if', url: state.ownResumeUrl }]
}

function stay(state: InboxMachine): InboxStep {
  return { state, effects: [] }
}

export type InboxMachine = {
  view: MachineView
  gen: number
  resumable: boolean
  via: 'fresh' | 'resume'
  ownResumeUrl: string | null
  pendingResume: ResumeEntry | null
  lastAutoReopenAt: number | null
  visible: boolean
  reopenOnShow: boolean
  retryOnShow: boolean
  resumeHopUsed: boolean
  reading: 'start' | 'replaced' | 'retry' | null
}

export type InboxEvent =
  | { type: 'start' }
  | { type: 'resume_read'; entry: ResumeEntry | null }
  | { type: 'session_opened'; gen: number; session: SessionOpened }
  | { type: 'session_refused'; gen: number; refusal: SessionRefused }
  | { type: 'iframe'; message: EmbedMessage }
  | { type: 'ready_timeout'; gen: number }
  | { type: 'retry' }
  | { type: 'visible'; value: boolean }
  | { type: 'keepalive_tick' }
  | { type: 'keepalive_failed'; status: number }
  | { type: 'logout' }
  | { type: 'destroy' }

export type InboxEffect =
  | { type: 'read_resume' }
  | { type: 'remember_resume'; entry: ResumeEntry }
  | { type: 'forget_resume_if'; url: string }
  | { type: 'forget_other_resumes' }
  | { type: 'forget_all_resumes' }
  | { type: 'open_session'; gen: number }
  | { type: 'mount_iframe'; url: string; origin: string }
  | { type: 'unmount_iframe' }
  | { type: 'arm_ready_timeout'; gen: number }
  | { type: 'clear_ready_timeout' }
  | { type: 'keep_alive' }
  | { type: 'notify' }

export type InboxStep = { state: InboxMachine; effects: InboxEffect[] }
