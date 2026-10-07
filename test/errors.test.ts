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

describe('refusal from an axios-shaped rejection', () => {
  it('reads the status from the response and the code from its body', () => {
    const error = { isAxiosError: true, code: 'ERR_BAD_REQUEST', status: 422, response: { status: 422, data: { code: 'reauth_required' } } }

    expect(toRefusal(error)).toEqual({ status: 422, code: 'reauth_required' })
    expect(codeForRefusal(toRefusal(error))).toBe('reauth_required')
    expect(actionFor(codeForRefusal(toRefusal(error)))).toBe('reconnect')
  })

  it('ignores the error code when the body has none', () => {
    const error = { isAxiosError: true, code: 'ERR_BAD_RESPONSE', response: { status: 503, data: '<html>' } }

    expect(toRefusal(error)).toEqual({ status: 503, code: null })
    expect(codeForRefusal(toRefusal(error))).toBe('unavailable')
  })

  it('maps an expired app session through the response status', () => {
    expect(codeForRefusal(toRefusal({ isAxiosError: true, code: 'ERR_BAD_REQUEST', response: { status: 419, data: { message: 'CSRF token mismatch.' } } }))).toBe('app_session_expired')
  })

  it('treats a response without a usable status as a network failure', () => {
    expect(toRefusal({ response: { status: 'nope', data: null } })).toEqual({ status: null, code: null })
  })

  it.each([
    ['an axios network error', { isAxiosError: true, code: 'ERR_NETWORK', message: 'Network Error', request: {} }],
    ['an axios timeout', { isAxiosError: true, code: 'ECONNABORTED', status: undefined }],
    ['a request that never got a response', { code: 'ERR_NETWORK', request: {} }],
  ])('turns %s into a network failure that offers a retry', (_, error) => {
    expect(toRefusal(error)).toEqual({ status: null, code: null })
    expect(codeForRefusal(toRefusal(error))).toBe('unavailable')
    expect(actionFor(codeForRefusal(toRefusal(error)))).toBe('retry')
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
