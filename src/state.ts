export type Frame = 'none' | 'loading' | 'live' | 'stale'

export type EmbedAction = 'retry' | 'reload' | 'reconnect' | 'checkout' | null

export type EmbedErrorCode =
  | 'session_expired'
  | 'inbox_expired'
  | 'session_revoked'
  | 'session_replaced'
  | 'subscription_required'
  | 'ready_timeout'
  | 'unavailable'
  | 'rate_limited'
  | 'app_session_expired'
  | 'reauth_required'
  | 'connection_without_number'
  | 'number_unavailable'
  | 'approver_without_access'
  | 'official_number_unsupported'
  | 'origin_not_allowed'
  | 'rejected'
  | 'customer_without_phone'
  | (string & {})

export type EmbedState =
  | { status: 'opening'; frame: 'none' | 'stale' }
  | { status: 'loading'; frame: 'loading' }
  | { status: 'ready'; frame: 'live' }
  | { status: 'error'; frame: 'none' | 'loading'; code: EmbedErrorCode; action: EmbedAction; retryAfter?: number }
  | { status: 'closed'; frame: 'none' }

export type MachineView = EmbedState | { status: 'idle'; frame: 'none' }

export type SessionOpened = { url: string; origin: string; resume_url?: string | null; resume_until?: string | null }

export type SessionRefused = { status: number | null; code: string | null; retryAfter?: number }

export type OpenSession = () => Promise<SessionOpened>

export type KeepAlive = () => Promise<void>

export type FrameOptions = { title?: string; configure?: (iframe: HTMLIFrameElement) => void }

export type Clock = {
  now(): number
  after(ms: number, callback: () => void): () => void
  every(ms: number, callback: () => void): () => void
}
