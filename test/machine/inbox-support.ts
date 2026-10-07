import { initialState, transition } from '../../src/machine/inbox'
import type { InboxEvent, InboxMachine, InboxStep } from '../../src/machine/inbox'
import type { ResumeEntry } from '../../src/resume'

export const NOW = Date.parse('2026-10-07T12:00:00Z')
export const ORIGIN = 'http://parli.test'
export const START_A = `${ORIGIN}/embed-inbox/start/a`
export const RESUME_A = `${ORIGIN}/chats?embed_inbox=a`
export const START_B = `${ORIGIN}/embed-inbox/start/b`
export const RESUME_B = `${ORIGIN}/chats?embed_inbox=b`
export const UNTIL = '2026-10-07T14:00:00+00:00'
export const STORED: ResumeEntry = { url: `${ORIGIN}/chats?embed_inbox=stored`, origin: ORIGIN, until: UNTIL }
export const OTHER_TAB: ResumeEntry = { url: `${ORIGIN}/chats?embed_inbox=other-tab`, origin: ORIGIN, until: UNTIL }

export function step(state: InboxMachine, event: InboxEvent, now: number = NOW): InboxStep {
  return transition(state, event, { now })
}

export function through(events: InboxEvent[], options: { resumable?: boolean; visible?: boolean; now?: number } = {}): InboxMachine {
  const first = initialState({ resumable: options.resumable ?? true, visible: options.visible ?? true })

  return events.reduce((state, event) => step(state, event, options.now ?? NOW).state, first)
}

export function opened(gen: number, url: string = START_A, resumeUrl: string | null = RESUME_A): InboxEvent {
  return { type: 'session_opened', gen, session: { url, origin: ORIGIN, resume_url: resumeUrl, resume_until: resumeUrl === null ? null : UNTIL } }
}

export function frame(type: 'ready' | 'session_expired' | 'session_revoked' | 'subscription_required' | 'session_replaced'): InboxEvent {
  return { type: 'iframe', message: { type } }
}

export const START: InboxEvent = { type: 'start' }
export const NOTHING_STORED: InboxEvent = { type: 'resume_read', entry: null }
export const STORED_READ: InboxEvent = { type: 'resume_read', entry: STORED }
export const HIDE: InboxEvent = { type: 'visible', value: false }
export const SHOW: InboxEvent = { type: 'visible', value: true }

export const freshOpening = (visible: boolean = true): InboxMachine => through([START, NOTHING_STORED], { visible })
export const freshLoading = (visible: boolean = true): InboxMachine => through([START, NOTHING_STORED, opened(0)], { visible })
export const freshReady = (visible: boolean = true): InboxMachine => through([START, NOTHING_STORED, opened(0), frame('ready')], { visible })
export const freshTimedOut = (visible: boolean = true): InboxMachine => through([START, NOTHING_STORED, opened(0), { type: 'ready_timeout', gen: 1 }], { visible })
export const resumeLoading = (visible: boolean = true): InboxMachine => through([START, STORED_READ], { visible })
export const resumeReady = (visible: boolean = true): InboxMachine => through([START, STORED_READ, frame('ready')], { visible })
export const resumeTimedOut = (visible: boolean = true): InboxMachine => through([START, STORED_READ, { type: 'ready_timeout', gen: 1 }], { visible })
