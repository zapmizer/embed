const MARGIN_MS = 2 * 60 * 1000

export function resumeKey(brand: string, person: string): string {
  return `${brand}-inbox:${person}`
}

export function defaultResumeStorage(): ResumeStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function webOriginOf(address: string): string | null {
  try {
    const parsed = new URL(address)

    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

export function readResume(storage: ResumeStorage | null, key: string, now: number): ResumeEntry | null {
  const stored = storedEntry(storage, key)

  if (stored === null) {
    return null
  }

  const url = 'url' in stored && typeof stored.url === 'string' ? stored.url : null
  const origin = 'origin' in stored && typeof stored.origin === 'string' ? stored.origin : null
  const until = 'until' in stored && typeof stored.until === 'string' ? stored.until : null

  if (url === null || origin === null || until === null || webOriginOf(url) !== origin) {
    return null
  }

  const deadline = Date.parse(until)

  if (Number.isNaN(deadline) || now >= deadline - MARGIN_MS) {
    return null
  }

  return { url, origin, until }
}

export function rememberResume(storage: ResumeStorage | null, key: string, entry: ResumeEntry): void {
  try {
    storage?.setItem(key, JSON.stringify(entry))
  } catch {
    return
  }
}

export function forgetResumeIf(storage: ResumeStorage | null, key: string, url: string): void {
  const stored = storedEntry(storage, key)

  if (stored === null || !('url' in stored) || stored.url !== url) {
    return
  }

  try {
    storage?.removeItem(key)
  } catch {
    return
  }
}

export function forgetOtherResumes(storage: ResumeStorage | null, brand: string, key: string | null): void {
  if (storage === null) {
    return
  }

  const prefix = resumeKey(brand, '')

  try {
    const stale: string[] = []

    for (let index = 0; index < storage.length; index++) {
      const candidate = storage.key(index)

      if (candidate !== null && candidate.startsWith(prefix) && candidate !== key) {
        stale.push(candidate)
      }
    }

    stale.forEach((candidate) => storage.removeItem(candidate))
  } catch {
    return
  }
}

export function forgetAllResumes(storage: ResumeStorage | null, brand: string): void {
  forgetOtherResumes(storage, brand, null)
}

function storedEntry(storage: ResumeStorage | null, key: string): object | null {
  if (storage === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? 'null')

    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

export interface ResumeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

export type ResumeEntry = { url: string; origin: string; until: string }
