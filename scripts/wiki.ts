// Gera a wiki a partir de docs/. A wiki é só um espelho: toda página é apagada e gerada de novo.
// Uso: bun scripts/wiki.ts <pasta do clone de embed.wiki.git>
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const REPO = 'https://github.com/zapmizer/embed'

const BANNER = `> Esta wiki espelha [\`docs/\`](${REPO}/tree/main/docs) da \`main\`. Ao fixar uma tag no app, leia \`docs/\` dessa tag: é a doc que acompanha o código que você instalou.\n\n`

export type Doc = { file: string; source: string }

export type Page = { name: string; title: string; body: string }

export function titleOf(source: string): string {
  return source.match(/^# (.+)$/m)?.[1]?.trim() ?? ''
}

export function pageName(file: string, source: string): string {
  if (file === 'README.md') {
    return 'Home'
  }

  return titleOf(source)
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function buildPages(docs: Doc[]): Page[] {
  const names = new Map(docs.map((doc) => [doc.file, pageName(doc.file, doc.source)]))

  const rewrite = (match: string, text: string, target: string): string => {
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) {
      return match
    }

    const [path = '', anchor] = target.split('#')
    const hash = anchor === undefined ? '' : `#${anchor}`
    const page = names.get(path)

    if (page !== undefined) {
      return `[${text}](${page}${hash})`
    }

    const inRepo = normalize(join('docs', path))

    return `[${text}](${REPO}/${extname(inRepo) === '' ? 'tree' : 'blob'}/main/${inRepo}${hash})`
  }

  return docs.map((doc) => {
    let body = doc.source.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, rewrite)

    if (doc.file === 'README.md') {
      body = body.replace(/\nEsta pasta vai junto com o código\.[^\n]*\n/, '')
    }

    return { name: names.get(doc.file) ?? '', title: doc.file === 'README.md' ? '@zapmizer/embed' : titleOf(doc.source), body: BANNER + body }
  })
}

export function sidebar(pages: Page[]): string {
  const items = pages.filter((page) => page.name !== 'Home').map((page) => `- [${page.title}](${page.name})`)

  return [`**[@zapmizer/embed](Home)**`, '', ...items, '', `[Código e exemplos](${REPO})`, ''].join('\n')
}

// Home primeiro, depois a ordem do índice de docs/README.md; o que não está no índice vai no fim.
export function ordered(docs: Doc[]): Doc[] {
  const index = docs.find((doc) => doc.file === 'README.md')?.source ?? ''
  const rank = (doc: Doc): number => {
    if (doc.file === 'README.md') {
      return -1
    }

    const at = index.indexOf(`](${doc.file}`)

    return at === -1 ? Number.MAX_SAFE_INTEGER : at
  }

  return [...docs].sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file))
}

if (import.meta.main) {
  const wiki = process.argv[2]

  if (wiki === undefined) {
    throw new Error('Uso: bun scripts/wiki.ts <pasta do clone da wiki>')
  }

  const docs = readdirSync('docs')
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, source: readFileSync(join('docs', file), 'utf8') }))
  const pages = buildPages(ordered(docs))

  for (const file of readdirSync(wiki)) {
    if (file.endsWith('.md')) {
      rmSync(join(wiki, file))
    }
  }

  for (const page of pages) {
    writeFileSync(join(wiki, `${page.name}.md`), page.body)
  }

  writeFileSync(join(wiki, '_Sidebar.md'), sidebar(pages))
}
