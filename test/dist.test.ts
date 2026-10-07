import { afterEach, describe, expect, it } from 'bun:test'
import { createConversation } from '../dist/conversation.js'
import { createInbox } from '../dist/inbox.js'
import { endEmbeds } from '../dist/logout.js'

describe('built package', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shares one registry between the entries, so logout reaches embeds created through other entries', () => {
    const pending = () => new Promise<never>(() => {})
    const conversation = createConversation({ container: document.body.appendChild(document.createElement('div')), brand: 'dist', openSession: pending, onState: () => {} })
    const inbox = createInbox({ container: document.body.appendChild(document.createElement('div')), brand: 'dist', person: null, openSession: pending, onState: () => {} })

    endEmbeds({ brand: 'dist', broadcast: false })

    expect(conversation.state.status).toBe('closed')
    expect(inbox.state.status).toBe('closed')
  })
})
