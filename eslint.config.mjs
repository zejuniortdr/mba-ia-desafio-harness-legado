// Lint do Balcão (G2) e regras de AST do harness (G5, R1, R2, R3).
// Rode pelos gates: `npm run gates`. Regras e motivação: docs/gates.md.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const report = (context, node, message) => context.report({ node, message })

// Nome estático de uma propriedade: a.b, a['b'] ou a[`b`]. Senão, undefined.
const propName = (node) => {
  if (!node.computed) return node.property.name
  const p = node.property
  if (p.type === 'Literal') return p.value
  if (p.type === 'TemplateLiteral' && p.expressions.length === 0) return p.quasis[0].value.cooked
  return undefined
}
const GLOBAL_OBJECTS = ['globalThis', 'global', 'window', 'self']
const TS_WRAPPERS = ['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']
const unwrap = (node) => (TS_WRAPPERS.includes(node.type) ? unwrap(node.expression) : node)

// Só é inofensivo o acesso direto a outra propriedade estática (process.exit, import.meta.url).
// Qualquer outro uso (alias, cast, desestruturação, Reflect.get, acesso computado) pode chegar ao env.
const safeAccess = (node) =>
  node.parent.type === 'MemberExpression' &&
  node.parent.object === node &&
  propName(node.parent) !== undefined &&
  propName(node.parent) !== 'env'

const PROCESS_MODULE = /^(node:)?process$/

// G5 (api): process.env só em api/src/config/.
const g5Api = {
  create(context) {
    const msg = 'G5: process.env só pode ser lido em api/src/config/'
    const check = (node) => {
      if (!safeAccess(node)) report(context, node, msg)
    }
    return {
      'Program:exit'(program) {
        const scope = context.sourceCode.getScope(program)
        const refs = [...scope.through, ...(scope.set.get('process')?.references ?? [])]
        for (const ref of refs) if (ref.identifier.name === 'process') check(ref.identifier)
      },
      MemberExpression(node) {
        // globalThis.process, globalThis['process']...
        const obj = unwrap(node.object)
        if (obj.type === 'Identifier' && GLOBAL_OBJECTS.includes(obj.name) && propName(node) === 'process')
          check(node)
      },
      ImportDeclaration(node) {
        if (PROCESS_MODULE.test(node.source.value)) report(context, node, `${msg} (nem importando o módulo process)`)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && PROCESS_MODULE.test(node.source.value))
          report(context, node, `${msg} (nem importando o módulo process)`)
      },
      CallExpression(node) {
        const [arg] = node.arguments
        if (node.callee.name === 'require' && arg?.type === 'Literal' && PROCESS_MODULE.test(arg.value))
          report(context, node, `${msg} (nem importando o módulo process)`)
      },
    }
  },
}

// G5 (web): import.meta.env só em web/src/config/.
const g5Web = {
  create(context) {
    const msg = 'G5: import.meta.env só pode ser lido em web/src/config/'
    return {
      MetaProperty(node) {
        if (node.meta.name === 'import' && node.property.name === 'meta' && !safeAccess(node)) report(context, node, msg)
      },
    }
  },
}

// R1: endereço fixo (host local ou porta padrão) só em config/. Cada cópia tem as suas portas.
const FIXED_HOST = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b/
const FIXED_PORT = /(^|[^\d])(4000|5173|5432)([^\d]|$)/
const r1 = {
  create(context) {
    const msg = 'R1: endereço fixo no código; leia host e porta de config/'
    const check = (node, text) => {
      if (typeof text === 'string' && (FIXED_HOST.test(text) || FIXED_PORT.test(text))) report(context, node, msg)
    }
    return {
      Literal(node) {
        if (typeof node.value === 'number' && [4000, 5173, 5432].includes(node.value)) report(context, node, msg)
        else check(node, node.value)
      },
      TemplateElement(node) {
        check(node, node.value.cooked)
      },
    }
  },
}

// R2: um único PrismaClient, em api/src/repositories/prisma.ts.
const r2 = {
  create(context) {
    const names = new Set(['PrismaClient']) // inclui aliases: import { PrismaClient as P }
    return {
      ImportSpecifier(node) {
        if ((node.imported.name ?? node.imported.value) === 'PrismaClient') names.add(node.local.name)
      },
      NewExpression(node) {
        const c = node.callee
        const name = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' ? propName(c) : undefined
        if (names.has(name))
          report(context, node, 'R2: new PrismaClient só em api/src/repositories/prisma.ts; importe `prisma` de lá')
      },
    }
  },
}

// R3: a seed é idempotente; usuário entra por upsert, nunca por create.
const r3 = {
  create(context) {
    return {
      CallExpression(node) {
        const c = node.callee
        if (c.type !== 'MemberExpression' || !['create', 'createMany', 'createManyAndReturn'].includes(propName(c))) return
        const target = c.object.type === 'MemberExpression' ? propName(c.object) : c.object.name
        if (target === 'user')
          report(context, node, 'R3: a seed precisa ser idempotente; use prisma.user.upsert, não create')
      },
    }
  },
}

const CODE = '{ts,tsx,mts,cts,js,jsx,mjs,cjs}'

const balcao = { rules: { G5api: g5Api, G5web: g5Web, R1: r1, R2: r2, R3: r3 } }

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    files: [`api/src/**/*.${CODE}`, `api/prisma/**/*.${CODE}`, `api/test/**/*.${CODE}`, `web/src/**/*.${CODE}`],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    // Comentário de supressão não vale: nenhuma diretiva inline é aceita.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    plugins: { balcao },
    rules: {
      // Só parâmetro com `_` escapa (ex.: o error handler do Express precisa de 4 argumentos).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: [`api/src/**/*.${CODE}`],
    ignores: ['api/src/config/**'],
    rules: { 'balcao/G5api': 'error', 'balcao/R1': 'error' },
  },
  {
    files: [`api/src/**/*.${CODE}`],
    ignores: ['api/src/repositories/prisma.ts'],
    rules: { 'balcao/R2': 'error' },
  },
  {
    files: [`web/src/**/*.${CODE}`],
    ignores: ['web/src/config/**'],
    rules: { 'balcao/G5web': 'error', 'balcao/R1': 'error' },
  },
  {
    files: [`api/prisma/**/*.${CODE}`],
    rules: { 'balcao/R3': 'error' },
  },
)
