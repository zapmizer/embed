import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { createConversation } from '../src/conversation'
import { createInbox } from '../src/inbox'
import { endEmbeds, listenToLogout } from '../src/logout'
import { fakeClock } from './support/clock'
import { PARLI } from './support/frames'
import { scriptedSessions } from './support/sessions'
import { memoryStorage } from './support/storage'

const ENTRY = JSON.stringify({ url: `${PARLI}/chats?embed_inbox=abc`, origin: PARLI, until: '2026-10-07T14:00:00+00:00' })

function liveInbox(brand: string) {
  return createInbox({ container: document.body.appendChild(document.createElement('div')), brand, person: '7:3', openSession: scriptedSessions().openSession, clock: fakeClock(), onState: () => {} })
}

function liveConversation(brand: string) {
  return createConversation({ container: document.body.appendChild(document.createElement('div')), brand, openSession: scriptedSessions().openSession, clock: fakeClock(), onState: () => {} })
}

function waitForChannel(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20))
}

describe('logout across tabs', () => {
  const stops: Array<() => void> = []

  beforeEach(() => {
    window.sessionStorage.clear()
  })

  afterEach(() => {
    stops.splice(0).forEach((stop) => stop())
    document.body.innerHTML = ''
  })

  it('closes every inbox and conversation of the brand in this tab', () => {
    const inbox = liveInbox('logout-a')
    const conversation = liveConversation('logout-a')

    endEmbeds({ brand: 'logout-a', broadcast: false })

    expect(inbox.state.status).toBe('closed')
    expect(conversation.state.status).toBe('closed')
  })

  it('leaves the embeds of another brand alone', () => {
    const other = liveInbox('logout-other')

    endEmbeds({ brand: 'logout-b', broadcast: false })

    expect(other.state.status).not.toBe('closed')
    other.destroy()
  })

  it('forgets every remembered inbox of the brand and nothing else', () => {
    window.sessionStorage.setItem('logout-c-inbox:7:3', ENTRY)
    window.sessionStorage.setItem('logout-c-inbox:8:4', ENTRY)
    window.sessionStorage.setItem('other-inbox:7:3', ENTRY)

    endEmbeds({ brand: 'logout-c', broadcast: false })

    expect(Object.keys(window.sessionStorage)).toEqual(['other-inbox:7:3'])
  })

  it('uses the storage the app gives', () => {
    const storage = memoryStorage({ 'logout-d-inbox:7:3': ENTRY })

    endEmbeds({ brand: 'logout-d', storage, broadcast: false })

    expect(storage.keys()).toEqual([])
  })

  it('tells the other tabs, which close their embeds and forget their way back (S11)', async () => {
    const storage = memoryStorage({ 'logout-e-inbox:7:3': ENTRY })
    const inbox = liveInbox('logout-e')

    stops.push(listenToLogout({ brand: 'logout-e', storage }))
    const otherTab = new BroadcastChannel('logout-e-embed-logout')

    otherTab.postMessage('logout')
    otherTab.close()
    await waitForChannel()

    expect(inbox.state.status).toBe('closed')
    expect(storage.keys()).toEqual([])
  })

  it('posts on the brand channel when broadcasting', async () => {
    const heard: unknown[] = []
    const otherTab = new BroadcastChannel('logout-f-embed-logout')

    otherTab.onmessage = (event) => heard.push(event.data)
    endEmbeds({ brand: 'logout-f' })
    await waitForChannel()
    otherTab.close()

    expect(heard).toEqual(['logout'])
  })

  it('does not post when the app has its own channel', async () => {
    const heard: unknown[] = []
    const otherTab = new BroadcastChannel('logout-g-embed-logout')

    otherTab.onmessage = (event) => heard.push(event.data)
    endEmbeds({ brand: 'logout-g', broadcast: false })
    await waitForChannel()
    otherTab.close()

    expect(heard).toEqual([])
  })

  it('stops listening when asked', async () => {
    const inbox = liveInbox('logout-h')
    const stop = listenToLogout({ brand: 'logout-h' })

    stop()
    const otherTab = new BroadcastChannel('logout-h-embed-logout')

    otherTab.postMessage('logout')
    otherTab.close()
    await waitForChannel()

    expect(inbox.state.status).not.toBe('closed')
    inbox.destroy()
  })

  it('still ends this tab without BroadcastChannel', () => {
    const original = globalThis.BroadcastChannel
    const inbox = liveInbox('logout-i')

    Reflect.deleteProperty(globalThis, 'BroadcastChannel')

    try {
      expect(() => endEmbeds({ brand: 'logout-i' })).not.toThrow()
      expect(listenToLogout({ brand: 'logout-i' })).toBeFunction()
    } finally {
      globalThis.BroadcastChannel = original
    }

    expect(inbox.state.status).toBe('closed')
  })
})
