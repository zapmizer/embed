import { endRegisteredEmbeds } from './registry'
import { defaultResumeStorage, forgetAllResumes } from './resume'
import type { ResumeStorage } from './resume'

export function endEmbeds(options: EndEmbedsOptions): void {
  endLocally(options.brand, options.storage)

  if (options.broadcast === false) {
    return
  }

  const channel = openChannel(options.brand)

  try {
    channel?.postMessage('logout')
  } catch {
    return
  } finally {
    channel?.close()
  }
}

export function listenToLogout(options: ListenToLogoutOptions): () => void {
  const channel = openChannel(options.brand)

  if (channel === null) {
    return () => {}
  }

  channel.onmessage = () => endLocally(options.brand, options.storage)

  return () => channel.close()
}

function endLocally(brand: string, storage: ResumeStorage | null | undefined): void {
  endRegisteredEmbeds(brand)
  forgetAllResumes(storage === undefined ? defaultResumeStorage() : storage, brand)
}

function openChannel(brand: string): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${brand}-embed-logout`) : null
  } catch {
    return null
  }
}

export type EndEmbedsOptions = { brand: string; storage?: ResumeStorage | null; broadcast?: boolean }

export type ListenToLogoutOptions = { brand: string; storage?: ResumeStorage | null }
