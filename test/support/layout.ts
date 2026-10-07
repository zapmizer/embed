export function placedSlot(rect: { top: number; left: number; width: number; height: number }): PlacedSlot {
  const slot = document.body.appendChild(document.createElement('section'))
  let current = rect

  slot.getBoundingClientRect = () => DOMRect.fromRect({ x: current.left, y: current.top, width: current.width, height: current.height })

  return {
    element: slot,
    move: (next) => {
      current = next
    },
  }
}

export function fakeResizeObserver(): FakeResizeObservers {
  const original = globalThis.ResizeObserver
  const observers: Array<{ callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }> = []

  class FakeResizeObserver {
    private readonly record: { callback: ResizeObserverCallback; targets: Element[]; disconnected: boolean }

    constructor(callback: ResizeObserverCallback) {
      this.record = { callback, targets: [], disconnected: false }
      observers.push(this.record)
    }

    observe(target: Element): void {
      this.record.targets.push(target)
    }

    unobserve(): void {}

    disconnect(): void {
      this.record.disconnected = true
    }
  }

  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver

  return {
    active: () => observers.filter((observer) => !observer.disconnected),
    resize: () => {
      for (const observer of observers.filter((candidate) => !candidate.disconnected)) {
        observer.callback([], {} as ResizeObserver)
      }
    },
    restore: () => {
      globalThis.ResizeObserver = original
    },
  }
}

export type PlacedSlot = { element: HTMLElement; move(rect: { top: number; left: number; width: number; height: number }): void }

export type FakeResizeObservers = {
  active(): Array<{ targets: Element[] }>
  resize(): void
  restore(): void
}
