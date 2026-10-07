import { describe, expect, it } from 'bun:test'
import { endRegisteredEmbeds, registerEmbed } from '../src/registry'
import { captureMicrotaskErrors } from './support/microtasks'
import { settle } from './support/sessions'

describe('live embeds of this tab', () => {
  it('ends every embed of the brand', () => {
    const ended: string[] = []
    const stopA = registerEmbed('registry-a', () => ended.push('first'))
    const stopB = registerEmbed('registry-a', () => ended.push('second'))

    endRegisteredEmbeds('registry-a')
    stopA()
    stopB()

    expect(ended).toEqual(['first', 'second'])
  })

  it('leaves embeds of another brand alone', () => {
    const ended: string[] = []
    const stop = registerEmbed('registry-b', () => ended.push('b'))

    endRegisteredEmbeds('registry-c')
    stop()

    expect(ended).toEqual([])
  })

  it('stops ending an embed once it unregistered', () => {
    const ended: string[] = []
    const stop = registerEmbed('registry-d', () => ended.push('d'))

    stop()
    endRegisteredEmbeds('registry-d')

    expect(ended).toEqual([])
  })

  it('tolerates an embed that unregisters while being ended', () => {
    const ended: string[] = []
    const stopFirst = registerEmbed('registry-e', () => {
      ended.push('first')
      stopFirst()
    })
    const stopSecond = registerEmbed('registry-e', () => ended.push('second'))

    endRegisteredEmbeds('registry-e')
    stopSecond()

    expect(ended).toEqual(['first', 'second'])
  })

  it('keeps ending the other embeds when one throws, and rethrows it later', async () => {
    const microtasks = captureMicrotaskErrors()
    const ended: string[] = []
    const failure = new Error('end failed')
    const stopFirst = registerEmbed('registry-f', () => {
      throw failure
    })
    const stopSecond = registerEmbed('registry-f', () => ended.push('second'))

    try {
      expect(() => endRegisteredEmbeds('registry-f')).not.toThrow()
      await settle()
    } finally {
      microtasks.restore()
      stopFirst()
      stopSecond()
    }

    expect(ended).toEqual(['second'])
    expect(microtasks.thrown()).toEqual([failure])
  })
})
