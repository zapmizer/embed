import { CONVERSATION_FRAME, createFrameSlot, defaultClock, isolated, requestSession, serialDispatcher } from './driver'
import { initialState, transition } from './machine/conversation'
import type { ConversationEffect, ConversationEvent, ConversationMachine } from './machine/conversation'
import { exposed } from './machine/view'
import { registerEmbed } from './registry'
import type { Clock, EmbedState, FrameOptions, OpenSession } from './state'

export function createConversation(options: ConversationOptions): Conversation {
  const clock = options.clock ?? defaultClock
  const readyTimeoutMs = options.readyTimeoutMs ?? 45_000
  let machine: ConversationMachine = initialState()
  let cancelReadyTimeout: (() => void) | null = null
  let released = false

  const dispatch = serialDispatcher<ConversationEvent>((event) => {
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
    kind: CONVERSATION_FRAME,
    frame: options.frame,
    onMessage: (message) => dispatch({ type: 'iframe', message }),
  })

  const unregister = registerEmbed(options.brand, () => dispatch({ type: 'logout' }))

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
    slot.stop()
    unregister()
  }

  function run(effect: ConversationEffect): void {
    if (effect.type === 'open_session') {
      const gen = effect.gen

      requestSession(
        options.openSession,
        (session) => dispatch({ type: 'session_opened', gen, session }),
        (refusal) => dispatch({ type: 'session_refused', gen, refusal }),
      )
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
    } else if (effect.type === 'emit_resize') {
      const height = effect.height

      isolated(() => options.onResize?.(height))
    } else if (effect.type === 'emit_message_sent') {
      const messageId = effect.message_id

      isolated(() => options.onMessageSent?.(messageId))
    } else {
      const state = exposed(machine.view)

      isolated(() => options.onState(state))
    }
  }

  dispatch({ type: 'start' })

  return {
    get state() {
      return exposed(machine.view)
    },
    retry: () => dispatch({ type: 'retry' }),
    reopen: () => dispatch({ type: 'reopen' }),
    destroy: () => dispatch({ type: 'destroy' }),
  }
}

export type ConversationOptions = {
  container: HTMLElement
  brand: string
  openSession: OpenSession
  onState: (state: EmbedState) => void
  onResize?: (height: number) => void
  onMessageSent?: (messageId: string | number) => void
  frame?: FrameOptions
  readyTimeoutMs?: number
  clock?: Clock
}

export type Conversation = {
  readonly state: EmbedState
  retry(): void
  reopen(): void
  destroy(): void
}
