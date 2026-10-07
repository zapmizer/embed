import { isolated } from './driver'

const live = new Map<string, Set<() => void>>()

export function registerEmbed(brand: string, end: () => void): () => void {
  const ends = live.get(brand) ?? new Set<() => void>()

  ends.add(end)
  live.set(brand, ends)

  return () => {
    ends.delete(end)
  }
}

export function endRegisteredEmbeds(brand: string): void {
  const ends = live.get(brand)

  if (ends === undefined) {
    return
  }

  for (const end of [...ends]) {
    isolated(end)
  }
}
