// Regras de dependência e de camada do Balcão. O `name` de cada regra é o ID do gate.
// tsPreCompilationDeps: true faz `import type` e `export type ... from` contarem como dependência.
// Rode pelos gates: `npm run gates`. Detalhe: docs/gates.md.
const pkg = (names) => `(^|node_modules/)(@types/)?(${names})(/|$)`

module.exports = {
  forbidden: [
    {
      name: 'G4',
      comment: 'http/ não fala com o banco: nada de @prisma/client nem repositories/.',
      severity: 'error',
      from: { path: '^api/src/http/' },
      to: { path: [pkg('@prisma/client|\\.prisma/client'), '^api/src/repositories/'] },
    },
    {
      name: 'G6',
      comment: 'services/ não conhece Express: nada de express, multer nem http/ (nem só tipo).',
      severity: 'error',
      from: { path: '^api/src/services/' },
      to: { path: [pkg('express|express-serve-static-core|multer'), '^api/src/http/'] },
    },
    {
      name: 'G7',
      comment: 'O pacote openai só entra por api/src/integrations/.',
      severity: 'error',
      from: { pathNot: '^api/src/integrations/' },
      to: { path: pkg('openai') },
    },
    {
      name: 'G8',
      comment: 'O front não importa nada de api/ (nem só tipo).',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '^api/' },
    },
    {
      name: 'G9',
      comment: 'Nenhum import circular em api/src nem em web/src.',
      severity: 'error',
      from: { path: '^(api|web)/src/' },
      to: { circular: true },
    },
    {
      name: 'R4',
      comment: 'jobs/ só orquestra: sem @prisma/client, repositories/ ou integrations/ direto; use um serviço.',
      severity: 'error',
      from: { path: '^api/src/jobs/' },
      to: { path: [pkg('@prisma/client|\\.prisma/client'), '^api/src/(repositories|integrations)/'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)dist/' },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.d.ts', '.js', '.mjs', '.cjs', '.json'],
    },
  },
}
