// Lint do Balcão (G2) e regras de AST do harness (G5, R1, R2, R3).
// Rode pelos gates: `npm run gates`. Regras e motivação: docs/gates.md.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const report = (context, node, message) => context.report({ node, message })

const isProcess = (node) =>
  (node.type === 'Identifier' && node.name === 'process') ||
  (node.type === 'MemberExpression' && !node.computed && node.property.name === 'process')
const propName = (node) =>
  node.computed ? (node.property.type === 'Literal' ? node.property.value : undefined) : node.property.name

// G5 (api): process.env só em api/src/config/.
const g5Api = {
  create(context) {
    const msg = 'G5: process.env só pode ser lido em api/src/config/'
    return {
      MemberExpression(node) {
        if (isProcess(node.object) && propName(node) === 'env') report(context, node, msg)
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && node.init && isProcess(node.init)) {
          if (node.id.properties.some((p) => p.type === 'Property' && (p.key.name ?? p.key.value) === 'env'))
            report(context, node, msg)
        }
      },
      ImportDeclaration(node) {
        if (/^(node:)?process$/.test(node.source.value)) report(context, node, `${msg} (nem importando o módulo process)`)
      },
      CallExpression(node) {
        const [arg] = node.arguments
        if (node.callee.name === 'require' && arg?.type === 'Literal' && /^(node:)?process$/.test(arg.value))
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
      MemberExpression(node) {
        if (node.object.type === 'MetaProperty' && propName(node) === 'env') report(context, node, msg)
      },
      VariableDeclarator(node) {
        if (node.id.type === 'ObjectPattern' && node.init?.type === 'MetaProperty') {
          if (node.id.properties.some((p) => p.type === 'Property' && (p.key.name ?? p.key.value) === 'env'))
            report(context, node, msg)
        }
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

const balcao = { rules: { G5api: g5Api, G5web: g5Web, R1: r1, R2: r2, R3: r3 } }

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**'] },
  {
    files: ['api/src/**/*.ts', 'api/prisma/**/*.ts', 'api/test/**/*.ts', 'web/src/**/*.{ts,tsx}'],
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
    files: ['api/src/**/*.ts'],
    ignores: ['api/src/config/**'],
    rules: { 'balcao/G5api': 'error', 'balcao/R1': 'error' },
  },
  {
    files: ['api/src/**/*.ts'],
    ignores: ['api/src/repositories/prisma.ts'],
    rules: { 'balcao/R2': 'error' },
  },
  {
    files: ['web/src/**/*.{ts,tsx}'],
    ignores: ['web/src/config/**'],
    rules: { 'balcao/G5web': 'error', 'balcao/R1': 'error' },
  },
  {
    files: ['api/prisma/**/*.ts'],
    rules: { 'balcao/R3': 'error' },
  },
)
