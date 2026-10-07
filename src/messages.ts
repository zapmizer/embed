export function parseEmbedMessage(event: MessageEvent, expected: ExpectedSender): EmbedMessage | null {
  if (expected.frame === null || event.source !== expected.frame) {
    return null
  }

  if (event.origin !== expected.origin) {
    return null
  }

  const data: unknown = event.data

  if (!isRecord(data) || data.source !== `${expected.brand}-embed`) {
    return null
  }

  return toMessage(data)
}

function toMessage(data: Record<string, unknown>): EmbedMessage | null {
  const type = data.type

  if (type === 'ready') {
    return { type: 'ready' }
  }

  if (type === 'resize') {
    return typeof data.height === 'number' && Number.isFinite(data.height) ? { type: 'resize', height: data.height } : null
  }

  if (type === 'message_sent') {
    const id = data.message_id

    return typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id)) ? { type: 'message_sent', message_id: id } : null
  }

  if (type === 'session_expired' || type === 'session_revoked' || type === 'subscription_required' || type === 'session_replaced') {
    return { type }
  }

  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export type EmbedEndType = 'session_expired' | 'session_revoked' | 'subscription_required' | 'session_replaced'

export type EmbedMessage =
  | { type: 'ready' }
  | { type: 'resize'; height: number }
  | { type: 'message_sent'; message_id: string | number }
  | { type: EmbedEndType }

type ExpectedSender = { brand: string; origin: string; frame: Window | null }
