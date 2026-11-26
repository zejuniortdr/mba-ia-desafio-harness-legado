#!/usr/bin/env node
// Gates do Balcão: roda todas as verificações, sem parar na primeira falha, e termina
// com uma linha por violação: `<ID> <arquivo>` (dependência sem uso: `G10 <package.json> <dep>`).
// Sai com 1 se houver qualquer violação. Regras e ferramentas: docs/gates.md.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = mkdtempSync(join(tmpdir(), 'balcao-gates-'))
const violations = new Set()
const rel = (file) => relative(ROOT, resolve(ROOT, file)).split('\\').join('/')
const add = (id, file, extra) => violations.add([id, rel(file), extra].filter(Boolean).join(' '))

function run(label, bin, args, cwd = ROOT) {
  const exe = join(cwd, 'node_modules', '.bin', bin)
  if (!existsSync(exe)) {
    console.log(`[${label}] ${bin} não instalado em ${rel(cwd) || '.'}: rode \`npm run up\``)
    return { status: -1, stdout: '', missing: true }
  }
  const r = spawnSync(exe, args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  console.log(`[${label}] ${r.status === 0 ? 'ok' : 'falhou'}`)
  if (r.status !== 0 && r.stderr?.trim()) console.log(r.stderr.trim().split('\n').slice(0, 5).join('\n'))
  return r
}

// Ferramenta que falhou sem deixar violação legível nunca passa em silêncio.
function guard(id, where, r, before) {
  if (r.status !== 0 && violations.size === before) add(id, where)
}

// G1: tipos.
for (const pkg of ['api', 'web']) {
  const before = violations.size
  const r = run(`G1 ${pkg}`, 'tsc', ['--noEmit', '--pretty', 'false', '-p', '.'], join(ROOT, pkg))
  for (const m of (r.stdout || '').matchAll(/^(.+?)\(\d+,\d+\): error /gm)) add('G1', join(pkg, m[1]))
  guard('G1', pkg, r, before)
}

// G2 (lint) e as regras de AST: G5, R1, R2, R3.
{
  const before = violations.size
  const r = run('G2 eslint', 'eslint', ['-f', 'json', '--max-warnings', '0', '.'])
  const ids = { 'balcao/G5api': 'G5', 'balcao/G5web': 'G5', 'balcao/R1': 'R1', 'balcao/R2': 'R2', 'balcao/R3': 'R3' }
  try {
    for (const f of JSON.parse(r.stdout || '[]')) for (const m of f.messages) add(ids[m.ruleId] ?? 'G2', f.filePath)
  } catch {
    // saída não é JSON: o guard abaixo marca a falha
  }
  guard('G2', 'eslint', r, before)
}

// G3: testes unitários da API.
{
  const before = violations.size
  const out = join(TMP, 'vitest.json')
  const r = run('G3 vitest', 'vitest', ['run', '--reporter=json', `--outputFile=${out}`], join(ROOT, 'api'))
  if (existsSync(out)) {
    const report = JSON.parse(readFileSync(out, 'utf8'))
    for (const t of report.testResults ?? []) if (t.status !== 'passed') add('G3', t.name)
  }
  guard('G3', 'api', r, before)
}

// G4, G6, G7, G8, G9 e R4: dependências e camadas (dependency-cruiser, pela API).
process.chdir(ROOT)
for (const [label, targets, tsconfig] of [
  ['api', ['api/src', 'api/prisma', 'api/test'], 'api/tsconfig.json'],
  ['web', ['web/src', 'web/vite.config.ts'], 'web/tsconfig.json'],
]) {
  try {
    const { cruise } = await import('dependency-cruiser')
    const { default: extractOptions } = await import('dependency-cruiser/config-utl/extract-depcruise-options')
    const { default: extractTSConfig } = await import('dependency-cruiser/config-utl/extract-ts-config')
    const options = await extractOptions(join(ROOT, '.dependency-cruiser.cjs'))
    const { output } = await cruise(
      targets,
      { ...options, validate: true, tsConfig: { fileName: tsconfig } },
      undefined,
      { tsConfig: extractTSConfig(tsconfig) },
    )
    const found = output.summary.violations
    console.log(`[G4-G9 depcruise ${label}] ${found.length ? 'falhou' : 'ok'}`)
    for (const v of found) {
      add(v.rule.name, v.from)
      for (const c of v.cycle ?? []) add(v.rule.name, c.name ?? c)
    }
  } catch (err) {
    console.log(`[G4-G9 depcruise ${label}] erro: ${err.message}`)
    add('G4', `depcruise-${label}`)
  }
}

// G10: arquivos, exports, tipos e dependências sem uso (knip).
{
  const before = violations.size
  const r = run('G10 knip', 'knip', ['--reporter', 'json', '--no-progress'])
  try {
    for (const issue of JSON.parse(r.stdout).issues) {
      for (const kind of ['dependencies', 'devDependencies', 'optionalPeerDependencies', 'unlisted', 'binaries', 'unresolved'])
        for (const d of issue[kind] ?? []) add('G10', issue.file, d.name)
      for (const kind of ['files', 'exports', 'types', 'enumMembers', 'namespaceMembers', 'duplicates'])
        if ((issue[kind] ?? []).length) add('G10', issue.file)
    }
  } catch {
    // saída não é JSON: o guard abaixo marca a falha
  }
  guard('G10', 'knip', r, before)
}

rmSync(TMP, { recursive: true, force: true })
const list = [...violations].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
console.log(`\n== violações (${list.length}) ==`)
for (const line of list) console.log(line)
process.exit(list.length ? 1 : 0)
