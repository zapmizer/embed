import type { FrameOptions, OpenSession } from '@zapmizer/embed/state'
import { fillFrame } from '../shared/render'
import { sessionFrom } from '../shared/session'

export const frame: FrameOptions = { configure: fillFrame }

export function clamp(height: number | null): string {
  return `${Math.min(800, Math.max(320, height ?? 480))}px`
}

export function conversationSession(customerId: number, theme: 'light' | 'dark'): OpenSession {
  return sessionFrom(`/customers/${customerId}/zapmizer-embed-session`, () => ({ theme }))
}
