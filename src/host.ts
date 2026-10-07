import { defaultClock, isolated } from './driver'
import { createInbox } from './inbox'
import type { Inbox } from './inbox'
import type { ResumeStorage } from './resume'
import type { Clock, EmbedState, FrameOptions, KeepAlive, OpenSession } from './state'

export function createInboxHost(options: InboxHostOptions): InboxHost {
  const clock = options.clock ?? defaultClock
  const idleMs = options.idleMs ?? 30 * 60_000
  const element = document.createElement('div')
  const frameContainer = document.createElement('div')
  const overlay = document.createElement('div')
  let inbox: Inbox | null = null
  let person: string | null = null
  let slot: HTMLElement | null = null
  let observer: ResizeObserver | null = null
  let cancelIdle: (() => void) | null = null
  let generation = 0
  let state: EmbedState = { status: 'closed', frame: 'none' }

  element.append(frameContainer, overlay)
  element.style.position = 'fixed'
  hide()
  document.body.appendChild(element)
  window.addEventListener('resize', measure)
  window.addEventListener('scroll', measure, true)

  function publish(next: EmbedState): void {
    state = next
    isolated(() => options.onState(next))
  }

  function hide(): void {
    element.style.visibility = 'hidden'
    element.style.pointerEvents = 'none'
    element.inert = true
    element.setAttribute('aria-hidden', 'true')
  }

  function show(): void {
    element.style.visibility = ''
    element.style.pointerEvents = ''
    element.inert = false
    element.removeAttribute('aria-hidden')
  }

  function measure(): void {
    if (slot === null) {
      return
    }

    const rect = slot.getBoundingClientRect()

    element.style.top = `${rect.top}px`
    element.style.left = `${rect.left}px`
    element.style.width = `${rect.width}px`
    element.style.height = `${rect.height}px`
  }

  function follow(nextSlot: HTMLElement): void {
    if (slot !== nextSlot) {
      releaseSlot()
      slot = nextSlot

      if (typeof ResizeObserver === 'function') {
        observer = new ResizeObserver(measure)
        observer.observe(nextSlot)
      }
    }

    measure()
  }

  function releaseSlot(): void {
    observer?.disconnect()
    observer = null
    slot = null
  }

  function cancelIdleTimer(): void {
    cancelIdle?.()
    cancelIdle = null
  }

  function teardown(): void {
    generation += 1
    inbox = null
    person = null
    cancelIdleTimer()
    releaseSlot()
    hide()
  }

  function open(nextPerson: string | null): Inbox {
    generation += 1
    const mine = generation

    person = nextPerson

    const created = createInbox({
      container: frameContainer,
      brand: options.brand,
      openSession: options.openSession,
      person: nextPerson,
      keepAlive: options.keepAlive,
      storage: options.storage,
      frame: options.frame,
      readyTimeoutMs: options.readyTimeoutMs,
      keepAliveMs: options.keepAliveMs,
      clock,
      onState: (next) => {
        if (mine !== generation) {
          return
        }

        publish(next)

        if (next.status === 'closed') {
          teardown()
        }
      },
    })

    inbox = created

    return created
  }

  function attach(nextSlot: HTMLElement, nextPerson: string | null): void {
    cancelIdleTimer()

    if (inbox !== null && inbox.state.status === 'closed') {
      generation += 1
      inbox = null
    }

    if (inbox !== null && nextPerson !== person) {
      const previous = inbox

      generation += 1
      inbox = null
      previous.destroy()
    }

    const current = inbox ?? open(nextPerson)

    follow(nextSlot)
    show()
    current.setVisible(true)
  }

  function detach(oldSlot: HTMLElement): void {
    if (oldSlot !== slot) {
      return
    }

    releaseSlot()
    hide()
    inbox?.setVisible(false)
    cancelIdleTimer()
    cancelIdle = clock.after(idleMs, close)
  }

  function close(): void {
    const current = inbox

    teardown()
    current?.destroy()

    if (state.status !== 'closed') {
      publish({ status: 'closed', frame: 'none' })
    }
  }

  function destroy(): void {
    close()
    window.removeEventListener('resize', measure)
    window.removeEventListener('scroll', measure, true)
    element.remove()
  }

  return {
    element,
    overlay,
    get state() {
      return state
    },
    attach,
    detach,
    retry: () => inbox?.retry(),
    close,
    destroy,
  }
}

export type InboxHostOptions = {
  brand: string
  openSession: OpenSession
  onState: (state: EmbedState) => void
  keepAlive?: KeepAlive
  storage?: ResumeStorage | null
  frame?: FrameOptions
  idleMs?: number
  readyTimeoutMs?: number
  keepAliveMs?: number
  clock?: Clock
}

export type InboxHost = {
  readonly element: HTMLDivElement
  readonly overlay: HTMLDivElement
  readonly state: EmbedState
  attach(slot: HTMLElement, person: string | null): void
  detach(slot: HTMLElement): void
  retry(): void
  close(): void
  destroy(): void
}
