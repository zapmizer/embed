import { actionFor } from '../errors.js'
import type { EmbedErrorCode, EmbedState, MachineView } from '../state.js'

export const AUTO_REOPEN_GAP_MS = 60_000

export const LINK_REOPENS_PER_GAP = 2

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

export function recentReopens(reopenedAt: readonly number[], now: number): number[] {
  return reopenedAt.filter((at) => now - at < AUTO_REOPEN_GAP_MS)
}
