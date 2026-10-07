import type { SessionOpened } from '../../src/state'
import { PARLI } from './frames'

export const START_URL = `${PARLI}/embed-inbox/start/abc`

export const RESUME_URL = `${PARLI}/chats?embed_inbox=abc`

export function session(id: string = 'abc', withResume: boolean = false): SessionOpened {
  const opened: SessionOpened = { url: `${PARLI}/embed-inbox/start/${id}`, origin: PARLI }

  return withResume ? { ...opened, resume_url: `${PARLI}/chats?embed_inbox=${id}`, resume_until: '2026-10-07T14:00:00+00:00' } : opened
}

export function scriptedSessions(): ScriptedSessions {
  const pending: Array<{ resolve: (opened: SessionOpened) => void; reject: (reason: unknown) => void }> = []

  return {
    openSession: () =>
      new Promise<SessionOpened>((resolve, reject) => {
        pending.push({ resolve, reject })
      }),
    calls: () => pending.length,
    resolve: (index, opened) => pending[index]?.resolve(opened),
    reject: (index, reason) => pending[index]?.reject(reason),
  }
}

export function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export type ScriptedSessions = {
  openSession: () => Promise<SessionOpened>
  calls(): number
  resolve(index: number, opened: SessionOpened): void
  reject(index: number, reason: unknown): void
}
