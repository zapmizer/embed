import { describe, expect, it } from 'bun:test'
import { actionFor, codeForRefusal, defaultMessages, toRefusal } from '../src/errors'

describe('action by error code', () => {
  it.each([
    ['session_expired', 'retry'],
    ['inbox_expired', 'retry'],
    ['session_revoked', 'retry'],
    ['session_replaced', 'retry'],
    ['subscription_required', 'checkout'],
    ['ready_timeout', 'retry'],
    ['unavailable', 'retry'],
    ['rate_limited', 'retry'],
    ['app_session_expired', 'reload'],
    ['reauth_required', 'reconnect'],
    ['connection_without_number', 'reconnect'],
    ['number_unavailable', 'reconnect'],
    ['approver_without_access', null],
    ['official_number_unsupported', null],
    ['origin_not_allowed', null],
    ['rejected', null],
    ['customer_without_phone', null],
    ['something_new_from_parli', null],
  ] as const)('%s → %p', (code, action) => {
    expect(actionFor(code)).toBe(action)
  })
})

describe('code of a refused session', () => {
  it.each([
    ['the network failed', { status: null, code: null }, 'unavailable'],
    ['the server is unavailable', { status: 503, code: 'unavailable' }, 'unavailable'],
    ['the server failed without a code', { status: 500, code: null }, 'unavailable'],
    ['the app session expired (419)', { status: 419, code: null }, 'app_session_expired'],
    ['the app session expired (401)', { status: 401, code: 'unauthenticated' }, 'app_session_expired'],
    ['there were too many openings', { status: 429, code: 'rate_limited' }, 'rate_limited'],
    ['the connection must be redone', { status: 422, code: 'reauth_required' }, 'reauth_required'],
    ['the subscription is inactive', { status: 422, code: 'subscription_required' }, 'subscription_required'],
    ['the customer has no phone', { status: 422, code: 'customer_without_phone' }, 'customer_without_phone'],
    ['Parli sent a code the lib does not know', { status: 422, code: 'brand_new_code' }, 'brand_new_code'],
    ['the code is empty', { status: 422, code: '' }, 'unavailable'],
  ])('when %s', (_, refusal, code) => {
    expect(codeForRefusal(refusal)).toBe(code)
  })
})

describe('refusal from whatever openSession rejected with', () => {
  it('keeps status, code and Retry-After', () => {
    expect(toRefusal({ status: 429, code: 'rate_limited', retryAfter: 30 })).toEqual({ status: 429, code: 'rate_limited', retryAfter: 30 })
  })

  it('leaves Retry-After out when it is not a number', () => {
    expect(toRefusal({ status: 429, code: 'rate_limited', retryAfter: '30' })).toEqual({ status: 429, code: 'rate_limited' })
  })

  it.each([new Error('Network Error'), 'boom', null, undefined, { status: '503' }])('turns %p into a network failure', (error) => {
    expect(toRefusal(error)).toEqual({ status: null, code: null })
  })
})

describe('default messages', () => {
  const codes = [
    'session_expired',
    'inbox_expired',
    'session_revoked',
    'session_replaced',
    'subscription_required',
    'ready_timeout',
    'unavailable',
    'rate_limited',
    'app_session_expired',
    'reauth_required',
    'connection_without_number',
    'number_unavailable',
    'approver_without_access',
    'official_number_unsupported',
    'origin_not_allowed',
    'rejected',
    'customer_without_phone',
  ]

  it.each(codes)('has a message for %s', (code) => {
    expect(defaultMessages[code]?.length ?? 0).toBeGreaterThan(0)
  })

  it('never names a brand', () => {
    expect(Object.values(defaultMessages).filter((message) => /parli|zapmizer|resolaris/i.test(message))).toEqual([])
  })
})
