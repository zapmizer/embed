import type { Clock } from '../../src/state'

export const START = Date.parse('2026-10-07T12:00:00Z')

export function fakeClock(start: number = START): FakeClock {
  let current = start
  let nextId = 0
  const timers = new Map<number, { at: number; every: number | null; callback: () => void }>()

  function schedule(ms: number, every: number | null, callback: () => void): () => void {
    nextId += 1
    const id = nextId

    timers.set(id, { at: current + ms, every, callback })

    return () => {
      timers.delete(id)
    }
  }

  function advance(ms: number): void {
    const target = current + ms

    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort(([, a], [, b]) => a.at - b.at)[0]

      if (due === undefined) {
        break
      }

      const [id, timer] = due

      current = timer.at

      if (timer.every === null) {
        timers.delete(id)
      } else {
        timer.at += timer.every
      }

      timer.callback()
    }

    current = target
  }

  return {
    now: () => current,
    after: (ms, callback) => schedule(ms, null, callback),
    every: (ms, callback) => schedule(ms, ms, callback),
    advance,
    pending: () => timers.size,
  }
}

export type FakeClock = Clock & { advance(ms: number): void; pending(): number }
