export function captureMicrotaskErrors(): MicrotaskErrors {
  const original = globalThis.queueMicrotask
  const thrown: unknown[] = []

  globalThis.queueMicrotask = (callback) =>
    original(() => {
      try {
        callback()
      } catch (error) {
        thrown.push(error)
      }
    })

  return {
    thrown: () => thrown,
    restore: () => {
      globalThis.queueMicrotask = original
    },
  }
}

export type MicrotaskErrors = { thrown(): unknown[]; restore(): void }
