import { afterAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const pkg = (await Bun.file(join(root, 'package.json')).json()) as {
  exports: Record<string, { types: string }>
  typesVersions: Record<string, Record<string, string[]>>
}
const subpaths = Object.keys(pkg.exports).map((key) => key.slice(2))

// O app consumidor é simulado: node_modules/@zapmizer/embed aponta para esta pasta, como num `bun add`.
const app = mkdtempSync(join(tmpdir(), 'embed-types-'))
mkdirSync(join(app, 'node_modules/@zapmizer'), { recursive: true })
symlinkSync(root, join(app, 'node_modules/@zapmizer/embed'))
symlinkSync(join(root, 'node_modules/vue'), join(app, 'node_modules/vue'))
writeFileSync(
  join(app, 'index.ts'),
  [
    ...subpaths.map((name, index) => `import * as m${index} from '@zapmizer/embed/${name}'`),
    `export const all = [${subpaths.map((_, index) => `m${index}`).join(', ')}]`,
    // Se os tipos não resolvessem (ou virassem any), esta linha não daria o erro esperado.
    `export const wrong: number = m${subpaths.indexOf('logout')}.endEmbeds`,
  ].join('\n'),
)

writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module' }))

afterAll(() => rmSync(app, { recursive: true, force: true }))

// O TypeScript 7 removeu o node10, então ele roda no TypeScript 5 (devDependency `typescript5`).
const modes = [
  { resolution: 'node10', module: 'commonjs', tsc: 'typescript5' },
  { resolution: 'node16', module: 'node16', tsc: 'typescript' },
  { resolution: 'nodenext', module: 'nodenext', tsc: 'typescript' },
  { resolution: 'bundler', module: 'esnext', tsc: 'typescript' },
]

describe('tipos publicados', () => {
  it('typesVersions cobre exatamente os subpaths de exports', () => {
    const mapped = pkg.typesVersions['*']!
    expect(Object.keys(mapped).sort()).toEqual([...subpaths].sort())
    for (const [key, entry] of Object.entries(pkg.exports)) expect(mapped[key.slice(2)]).toEqual([entry.types.slice(2)])
  })

  for (const mode of modes) {
    it(`resolve todos os subpaths com moduleResolution ${mode.resolution}`, async () => {
      const config = join(app, `tsconfig.${mode.resolution}.json`)
      writeFileSync(
        config,
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, target: 'es2022', lib: ['es2022', 'dom'], module: mode.module, moduleResolution: mode.resolution, types: [], skipLibCheck: false },
          files: ['index.ts'],
        }),
      )
      const tsc = join(root, 'node_modules', mode.tsc, 'bin/tsc')
      const run = Bun.spawn(['bun', tsc, '-p', config], { cwd: app, stdout: 'pipe', stderr: 'pipe' })
      const output = await new Response(run.stdout).text()
      await run.exited
      // O único erro aceito é o proposital de `wrong`: tudo mais resolveu e tem tipo de verdade.
      const errors = output.split('\n').filter((line) => line.includes('error TS'))
      expect(errors).toHaveLength(1)
      expect(errors[0]).toContain('index.ts(')
      expect(errors[0]).toContain('TS2322')
    }, 60_000)
  }
})
