import { actionFor } from '../errors'
import type { EmbedErrorCode, EmbedState, MachineView } from '../state'

export const AUTO_REOPEN_GAP_MS = 60_000

export function failed(code: EmbedErrorCode, frame: 'none' | 'loading', retryAfter?: number): EmbedState {
  const action = actionFor(code)

  return retryAfter === undefined ? { status: 'error', frame, code, action } : { status: 'error', frame, code, action, retryAfter }
}

export function exposed(view: MachineView): EmbedState {
  return view.status === 'idle' ? { status: 'opening', frame: 'none' } : view
}

export function canAutoReopen(lastAutoReopenAt: number | null, now: number): boolean {
  return lastAutoReopenAt === null || now - lastAutoReopenAt >= AUTO_REOPEN_GAP_MS
}
