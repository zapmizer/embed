import type { ResumeStorage } from '../../src/resume'

export function memoryStorage(entries: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(entries))

  return {
    get length() {
      return data.size
    },
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, String(value))
    },
    removeItem: (key) => {
      data.delete(key)
    },
    keys: () => [...data.keys()],
  }
}

export function blockedStorage(): ResumeStorage {
  const blocked = (): never => {
    throw new Error('blocked')
  }

  return {
    get length() {
      return blocked()
    },
    key: blocked,
    getItem: blocked,
    setItem: blocked,
    removeItem: blocked,
  }
}

export type MemoryStorage = ResumeStorage & { keys(): string[] }
