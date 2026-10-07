import { afterEach, describe, expect, it } from 'bun:test'
import { defaultResumeStorage, forgetAllResumes, forgetOtherResumes, forgetResumeIf, readResume, rememberResume, resumeKey, webOriginOf } from '../src/resume'
import type { ResumeStorage } from '../src/resume'
import { blockedStorage, memoryStorage } from './support/storage'

const NOW = Date.parse('2026-09-30T20:00:00Z')
const MINUTE = 60 * 1000
const ENTRY = { url: 'http://localhost:8001/chats?embed_inbox=abc', origin: 'http://localhost:8001', until: '2026-09-30T22:00:00+00:00' }
const ANA = resumeKey('zapmizer', '7:3')
const APP_DRAFT = 'app.draft.v1:7:3'

function entryEndingIn(offset: number) {
  return { ...ENTRY, until: new Date(NOW + offset).toISOString() }
}

describe('way back to the inbox', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('keys the entry by brand and person', () => {
    expect(resumeKey('parli', '7:3')).toBe('parli-inbox:7:3')
  })

  it('reads back the inbox remembered for the same person', () => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, ENTRY)

    expect(readResume(storage, resumeKey('zapmizer', '7:3'), NOW)).toEqual(ENTRY)
  })

  it.each([
    ['another user', '8:3'],
    ['another team', '7:4'],
  ])('does not hand the inbox to %s', (_, person) => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, ENTRY)

    expect(readResume(storage, resumeKey('zapmizer', person), NOW)).toBeNull()
  })

  it('does not hand the inbox to another brand', () => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, ENTRY)

    expect(readResume(storage, resumeKey('parli', '7:3'), NOW)).toBeNull()
  })

  it('resumes a session that ends in more than two minutes', () => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, entryEndingIn(2 * MINUTE + 1))

    expect(readResume(storage, ANA, NOW)).toEqual(entryEndingIn(2 * MINUTE + 1))
  })

  it.each([
    ['ends in exactly two minutes', 2 * MINUTE],
    ['ends in less than two minutes', MINUTE],
    ['already ended', -MINUTE],
  ])('does not resume a session that %s', (_, offset) => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, entryEndingIn(offset))

    expect(readResume(storage, ANA, NOW)).toBeNull()
  })

  it.each([
    ['is not JSON', 'not-json'],
    ['is JSON null', 'null'],
    ['has no deadline', JSON.stringify({ url: ENTRY.url, origin: ENTRY.origin })],
    ['has an unreadable deadline', JSON.stringify({ ...ENTRY, until: 'amanhã' })],
    ['has no url', JSON.stringify({ origin: ENTRY.origin, until: ENTRY.until })],
    ['has no origin', JSON.stringify({ url: ENTRY.url, until: ENTRY.until })],
    ['points to another origin than the one it trusts', JSON.stringify({ ...ENTRY, url: 'https://evil.test/chats?embed_inbox=abc' })],
    ['is not a web address', JSON.stringify({ ...ENTRY, url: 'javascript:alert(1)', origin: 'null' })],
    ['is not an address at all', JSON.stringify({ ...ENTRY, url: 'chats?embed_inbox=abc' })],
  ])('ignores an entry that %s', (_, raw) => {
    expect(readResume(memoryStorage({ [ANA]: raw }), ANA, NOW)).toBeNull()
  })

  it('forgets the entry when it still points to the given url', () => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, ENTRY)
    forgetResumeIf(storage, ANA, ENTRY.url)

    expect(storage.keys()).toEqual([])
  })

  it('keeps the entry another tab wrote over it', () => {
    const storage = memoryStorage()

    rememberResume(storage, ANA, { ...ENTRY, url: 'http://localhost:8001/chats?embed_inbox=other' })
    forgetResumeIf(storage, ANA, ENTRY.url)

    expect(readResume(storage, ANA, NOW)?.url).toBe('http://localhost:8001/chats?embed_inbox=other')
  })

  it('forgets the inboxes of other people of the same brand', () => {
    const storage = memoryStorage({ [ANA]: JSON.stringify(ENTRY), 'zapmizer-inbox:8:3': JSON.stringify(ENTRY), 'zapmizer-inbox:7:4': JSON.stringify(ENTRY) })

    forgetOtherResumes(storage, 'zapmizer', ANA)

    expect(storage.keys()).toEqual([ANA])
  })

  it('forgets every inbox of the brand on logout', () => {
    const storage = memoryStorage({ [ANA]: JSON.stringify(ENTRY), 'zapmizer-inbox:8:3': JSON.stringify(ENTRY) })

    forgetAllResumes(storage, 'zapmizer')

    expect(storage.keys()).toEqual([])
  })

  it.each([
    ['pruning', (storage: ResumeStorage) => forgetOtherResumes(storage, 'zapmizer', ANA)],
    ['signing out', (storage: ResumeStorage) => forgetAllResumes(storage, 'zapmizer')],
  ])('keeps what other screens and brands left in the tab when %s', (_, forget) => {
    const storage = memoryStorage({ [APP_DRAFT]: '{}', 'parli-inbox:7:3': JSON.stringify(ENTRY), 'zapmizer-inbox:8:3': JSON.stringify(ENTRY) })

    forget(storage)

    expect(memoryKeys(storage)).toEqual([APP_DRAFT, 'parli-inbox:7:3'])
  })

  it.each([
    ['reading', (storage: ResumeStorage) => readResume(storage, ANA, NOW)],
    ['remembering', (storage: ResumeStorage) => rememberResume(storage, ANA, ENTRY)],
    ['forgetting', (storage: ResumeStorage) => forgetResumeIf(storage, ANA, ENTRY.url)],
    ['pruning', (storage: ResumeStorage) => forgetOtherResumes(storage, 'zapmizer', ANA)],
    ['signing out', (storage: ResumeStorage) => forgetAllResumes(storage, 'zapmizer')],
  ])('keeps working when the browser blocks the storage while %s', (_, use) => {
    expect(() => use(blockedStorage())).not.toThrow()
  })

  it('has nothing to resume when the browser blocks the storage', () => {
    expect(readResume(blockedStorage(), ANA, NOW)).toBeNull()
  })

  it('has nothing to resume without a storage', () => {
    expect(readResume(null, ANA, NOW)).toBeNull()
  })

  it('uses the sessionStorage of the tab by default', () => {
    expect(defaultResumeStorage()).toBe(window.sessionStorage)
  })

  it('has no storage when the browser refuses the sessionStorage', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage')

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError')
      },
    })

    try {
      expect(defaultResumeStorage()).toBeNull()
    } finally {
      if (original !== undefined) {
        Object.defineProperty(window, 'sessionStorage', original)
      }
    }
  })

  it.each([
    ['https://parlichat.com/chats?x=1', 'https://parlichat.com'],
    ['http://localhost:8001/chats', 'http://localhost:8001'],
    ['javascript:alert(1)', null],
    ['chats', null],
  ])('reads the web origin of %s', (address, origin) => {
    expect(webOriginOf(address)).toBe(origin)
  })
})

function memoryKeys(storage: ResumeStorage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null)
}
