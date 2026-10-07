import { afterEach, describe, expect, it } from 'bun:test'
import { parseEmbedMessage } from '../src/messages'
import { BRAND, PARLI, appendFrame, messageFrom } from './support/frames'

function expectedFor(iframe: HTMLIFrameElement) {
  return { brand: BRAND, origin: PARLI, frame: iframe.contentWindow }
}

describe('embed messages', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    [{ type: 'ready' }, { type: 'ready' }],
    [{ type: 'resize', height: 612 }, { type: 'resize', height: 612 }],
    [{ type: 'message_sent', message_id: 'wamid.1' }, { type: 'message_sent', message_id: 'wamid.1' }],
    [{ type: 'message_sent', message_id: 42 }, { type: 'message_sent', message_id: 42 }],
    [{ type: 'session_expired' }, { type: 'session_expired' }],
    [{ type: 'session_revoked' }, { type: 'session_revoked' }],
    [{ type: 'subscription_required' }, { type: 'subscription_required' }],
    [{ type: 'session_replaced' }, { type: 'session_replaced' }],
  ] as const)('accepts %o from the current iframe', (data, expected) => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', ...data }), expectedFor(iframe))).toEqual(expected)
  })

  it('ignores a message from another origin that claims to be the embed', () => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', type: 'ready' }, 'https://evil.test'), expectedFor(iframe))).toBeNull()
  })

  it('ignores a message of another brand', () => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'zapmizer-embed', type: 'ready' }), expectedFor(iframe))).toBeNull()
  })

  it('ignores other messages from the embed origin', () => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { type: 'ready' }), expectedFor(iframe))).toBeNull()
  })

  it.each([null, 'ready', 42])('ignores a message whose data is %p', (data) => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, data), expectedFor(iframe))).toBeNull()
  })

  it('ignores a message from another iframe of the same origin', () => {
    const iframe = appendFrame()
    const other = appendFrame()

    expect(parseEmbedMessage(messageFrom(other.contentWindow, { source: 'parli-embed', type: 'ready' }), expectedFor(iframe))).toBeNull()
  })

  it('ignores a message from a window that is not an iframe', () => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(window, { source: 'parli-embed', type: 'ready' }), expectedFor(iframe))).toBeNull()
  })

  it('ignores every message when there is no iframe to compare with', () => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', type: 'ready' }), { brand: BRAND, origin: PARLI, frame: null })).toBeNull()
  })

  it.each(['session_closed', 'READY', '', undefined])('ignores the unknown type %p', (type) => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', type }), expectedFor(iframe))).toBeNull()
  })

  it.each([undefined, '612', Number.NaN, Number.POSITIVE_INFINITY])('ignores a resize whose height is %p', (height) => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', type: 'resize', height }), expectedFor(iframe))).toBeNull()
  })

  it.each([null, undefined, Number.NaN, {}])('ignores a message_sent whose id is %p', (messageId) => {
    const iframe = appendFrame()

    expect(parseEmbedMessage(messageFrom(iframe.contentWindow, { source: 'parli-embed', type: 'message_sent', message_id: messageId }), expectedFor(iframe))).toBeNull()
  })
})
