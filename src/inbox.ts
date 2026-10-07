import { INBOX_FRAME, createFrameSlot, defaultClock, requestSession, serialDispatcher } from './driver'
import { toRefusal } from './errors'
import { initialState, transition } from './machine/inbox'
import type { InboxEffect, InboxEvent, InboxMachine } from './machine/inbox'
import { exposed } from './machine/view'
import { registerEmbed } from './registry'
import { defaultResumeStorage, forgetAllResumes, forgetOtherResumes, forgetResumeIf, readResume, rememberResume, resumeKey } from './resume'
import type { ResumeStorage } from './resume'
import type { Clock, EmbedState, FrameOptions, KeepAlive, OpenSession } from './state'

export function createInbox(options: InboxOptions): Inbox {
  const clock = options.clock ?? defaultClock
  const readyTimeoutMs = options.readyTimeoutMs ?? 45_000
  const keepAliveMs = options.keepAliveMs ?? 15 * 60_000
  const person = options.person === null || options.person === '' ? null : options.person
  const key = person === null ? null : resumeKey(options.brand, person)
  const storage = key === null ? null : options.storage === undefined ? defaultResumeStorage() : options.storage
  let machine: InboxMachine = initialState({ resumable: key !== null, visible: true })
  let cancelReadyTimeout: (() => void) | null = null
  let released = false

  const dispatch = serialDispatcher<InboxEvent>((event) => {
    const step = transition(machine, event, { now: clock.now() })

    machine = step.state
    step.effects.forEach(run)

    if (machine.view.status === 'closed') {
      release()
    }
  })

  const slot = createFrameSlot({
    container: options.container,
    brand: options.brand,
    kind: INBOX_FRAME,
    frame: options.frame,
    onMessage: (message) => dispatch({ type: 'iframe', message }),
  })

  const unregister = registerEmbed(options.brand, () => dispatch({ type: 'logout' }))

  const keepAlive = options.keepAlive

  const stopKeepAlive = keepAlive === undefined ? null : clock.every(keepAliveMs, () => dispatch({ type: 'keepalive_tick' }))

  function clearReadyTimeout(): void {
    cancelReadyTimeout?.()
    cancelReadyTimeout = null
  }

  function release(): void {
    if (released) {
      return
    }

    released = true
    clearReadyTimeout()
    stopKeepAlive?.()
    slot.stop()
    unregister()
  }

  function pingAppSession(ping: KeepAlive): void {
    let pending: Promise<void>

    try {
      pending = Promise.resolve(ping())
    } catch (error) {
      pending = Promise.reject(error)
    }

    pending.catch((error: unknown) => {
      const status = toRefusal(error).status

      if (status !== null) {
        dispatch({ type: 'keepalive_failed', status })
      }
    })
  }

  function run(effect: InboxEffect): void {
    if (effect.type === 'open_session') {
      const gen = effect.gen

      requestSession(
        options.openSession,
        (session) => dispatch({ type: 'session_opened', gen, session }),
        (refusal) => dispatch({ type: 'session_refused', gen, refusal }),
      )
    } else if (effect.type === 'read_resume') {
      dispatch({ type: 'resume_read', entry: key === null ? null : readResume(storage, key, clock.now()) })
    } else if (effect.type === 'remember_resume') {
      if (key !== null) {
        rememberResume(storage, key, effect.entry)
      }
    } else if (effect.type === 'forget_resume_if') {
      if (key !== null) {
        forgetResumeIf(storage, key, effect.url)
      }
    } else if (effect.type === 'forget_other_resumes') {
      forgetOtherResumes(storage, options.brand, key)
    } else if (effect.type === 'forget_all_resumes') {
      forgetAllResumes(storage, options.brand)
    } else if (effect.type === 'mount_iframe') {
      slot.mount(effect.url, effect.origin)
    } else if (effect.type === 'unmount_iframe') {
      slot.unmount()
    } else if (effect.type === 'arm_ready_timeout') {
      const gen = effect.gen

      clearReadyTimeout()
      cancelReadyTimeout = clock.after(readyTimeoutMs, () => {
        cancelReadyTimeout = null
        dispatch({ type: 'ready_timeout', gen })
      })
    } else if (effect.type === 'clear_ready_timeout') {
      clearReadyTimeout()
    } else if (effect.type === 'keep_alive') {
      if (keepAlive !== undefined) {
        pingAppSession(keepAlive)
      }
    } else {
      options.onState(exposed(machine.view))
    }
  }

  dispatch({ type: 'start' })

  return {
    get state() {
      return exposed(machine.view)
    },
    retry: () => dispatch({ type: 'retry' }),
    setVisible: (value: boolean) => dispatch({ type: 'visible', value }),
    destroy: () => dispatch({ type: 'destroy' }),
  }
}

export type InboxOptions = {
  container: HTMLElement
  brand: string
  openSession: OpenSession
  person: string | null
  onState: (state: EmbedState) => void
  keepAlive?: KeepAlive
  storage?: ResumeStorage | null
  frame?: FrameOptions
  readyTimeoutMs?: number
  keepAliveMs?: number
  clock?: Clock
}

export type Inbox = {
  readonly state: EmbedState
  retry(): void
  setVisible(value: boolean): void
  destroy(): void
}
