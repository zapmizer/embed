// O relógio falso de docs/testes.md, para testes.
import type { Clock } from '@zapmizer/embed/state'

export function fakeClock(start = Date.parse('2026-10-07T12:00:00Z')) {
  let current = start
  let nextId = 0
  const timers = new Map<number, { at: number; every: number | null; callback: () => void }>()

  const schedule = (ms: number, every: number | null, callback: () => void) => {
    const id = ++nextId

    timers.set(id, { at: current + ms, every, callback })

    return () => void timers.delete(id)
  }

  const clock: Clock = {
    now: () => current,
    after: (ms, callback) => schedule(ms, null, callback),
    every: (ms, callback) => schedule(ms, ms, callback),
  }

  // Avança o tempo, disparando os timers na ordem.
  function advance(ms: number) {
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

  return { ...clock, advance }
}
