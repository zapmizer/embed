import { describe, expect, it } from 'bun:test'
import { buildPages, ordered, pageName, sidebar } from '../scripts/wiki'

const home = { file: 'README.md', source: '# Documentação\n\nEsta pasta vai junto com o código. Pela tag.\n\n1. [Backend](backend.md)\n2. [Vue](vue.md)\n' }
const backend = { file: 'backend.md', source: '# Backend: o endpoint de sessão\n\nVeja [Vue](vue.md#conversa), [o exemplo](../examples/node/session.ts), [a pasta](../examples/laravel), [acima](#topo) e [fora](https://example.com).\n' }
const vue = { file: 'vue.md', source: '# Vue\n' }

describe('wiki mirror', () => {
  it('names a page after its title, without punctuation', () => {
    expect(pageName('backend.md', backend.source)).toBe('Backend-o-endpoint-de-sessão')
    expect(pageName('README.md', home.source)).toBe('Home')
  })

  it('points doc links to wiki pages and repo links to main', () => {
    const page = buildPages([home, backend, vue]).find((candidate) => candidate.name === 'Backend-o-endpoint-de-sessão')

    expect(page?.body).toContain('[Vue](Vue#conversa)')
    expect(page?.body).toContain('[o exemplo](https://github.com/zapmizer/embed/blob/main/examples/node/session.ts)')
    expect(page?.body).toContain('[a pasta](https://github.com/zapmizer/embed/tree/main/examples/laravel)')
    expect(page?.body).toContain('[acima](#topo)')
    expect(page?.body).toContain('[fora](https://example.com)')
  })

  it('opens every page with the note on versions and drops the folder line from Home', () => {
    const pages = buildPages([home, backend])

    expect(pages.every((page) => page.body.startsWith('> Esta wiki espelha'))).toBe(true)
    expect(pages[0]?.body).not.toContain('Esta pasta vai junto')
  })

  it('follows the order of the docs index, with Home first', () => {
    const extra = { file: 'aaa.md', source: '# Extra\n' }

    expect(ordered([vue, extra, backend, home]).map((doc) => doc.file)).toEqual(['README.md', 'backend.md', 'vue.md', 'aaa.md'])
    expect(sidebar(buildPages(ordered([vue, backend, home])))).toContain('- [Backend: o endpoint de sessão](Backend-o-endpoint-de-sessão)\n- [Vue](Vue)')
  })
})
