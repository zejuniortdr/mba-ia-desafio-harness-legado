# Gates do Balcão

`npm run gates`, na raiz, roda todas as verificações sem parar na primeira falha e termina com uma linha por violação:

```
== violações (2) ==
G4 api/src/http/routes/stats.ts
G10 api/package.json left-pad
```

O formato é `<ID> <arquivo>`. Para dependência sem uso, a linha traz também o nome da dependência. O comando sai com 1 se houver qualquer violação e com 0 se não houver nenhuma. Se uma ferramenta quebrar sem gerar saída legível, a lista mostra `<ID> <pacote>` (ex.: `G1 api`). Nada passa em silêncio.

O hook `.githooks/pre-commit` roda o mesmo comando antes de cada commit. Ele é ativado pelo `npm run up` (`git config core.hooksPath .githooks`).

## Regras

| ID | Invariante | Ferramenta | Onde está |
|---|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` de cada pacote | `api/tsconfig.json`, `web/tsconfig.json` |
| G2 | Lint sem erro e sem warning, com variável/import sem uso e `any` explícito | ESLint + typescript-eslint, `--max-warnings 0` | `eslint.config.mjs` |
| G3 | Testes unitários (`api/src/**/*.test.ts`) passam | vitest | `api/vitest.config.mts` |
| G4 | `api/src/http/` não importa `@prisma/client` nem `api/src/repositories/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | regra ESLint de AST (`balcao/G5api`, `balcao/G5web`) | `eslint.config.mjs` |
| G6 | `api/src/services/` não importa `express`, `multer` nem `api/src/http/`, nem só tipo | dependency-cruiser | `.dependency-cruiser.cjs` |
| G7 | `openai` só em `api/src/integrations/` | dependency-cruiser | `.dependency-cruiser.cjs` |
| G8 | `web/` não importa nada de `api/`, nem só tipo | dependency-cruiser | `.dependency-cruiser.cjs` |
| G9 | Nenhum import circular em `api/src/` e `web/src/` | dependency-cruiser (`circular`) | `.dependency-cruiser.cjs` |
| G10 | Nenhum arquivo, export (inclusive de tipo) ou dependência sem uso | knip | `knip.json` |
| R1 | Nenhum endereço fixo (`localhost`, `127.0.0.1`, `0.0.0.0`, portas 4000/5173/5432) fora de `config/` | regra ESLint de AST (`balcao/R1`) | `eslint.config.mjs` |
| R2 | `new PrismaClient` só em `api/src/repositories/prisma.ts` | regra ESLint de AST (`balcao/R2`) | `eslint.config.mjs` |
| R3 | A seed (`api/prisma/**`) não cria usuário com `create`/`createMany`, só com `upsert` | regra ESLint de AST (`balcao/R3`) | `eslint.config.mjs` |
| R4 | `api/src/jobs/` não importa `@prisma/client`, `repositories/` nem `integrations/` | dependency-cruiser | `.dependency-cruiser.cjs` |

O orquestrador é `scripts/gates.mjs`. Ele chama cada ferramenta, lê a saída JSON e escreve a lista final.

### Imports só de tipo (G6, G8)

O dependency-cruiser roda com `tsPreCompilationDeps: true`. Assim `import type`, `export type ... from` e `import('x').Tipo` contam como dependência, mesmo sumindo do JavaScript compilado. Sem essa opção, a G6 e a G8 deixariam passar exatamente os imports só de tipo.

### Sem supressão

O ESLint roda com `linterOptions.noInlineConfig: true`, então um `eslint-disable` não desliga regra nenhuma. Nenhum arquivo de `api/src/` ou `web/src/` fica fora das ferramentas. As únicas exceções são as que a própria regra define: `config/` na G5 e na R1, e `repositories/prisma.ts` na R2. No `no-unused-vars`, só parâmetro com prefixo `_` escapa, porque o error handler do Express precisa de quatro argumentos. Variável e import sem uso continuam barrados.

## Regras próprias: motivação

- **R1, endereço fixo.** O Balcão achava que era a única cópia no mundo: CORS fixo em `http://localhost:5173`, front com `|| 'http://localhost:4000'` em três arquivos e porta 4000 cravada no `main.ts`. Na segunda worktree, o front de uma cópia falava com a API da outra. Host e porta agora vêm de `config/`, que recebe os valores do `npm run up`.
- **R2, um único PrismaClient.** O worker criava o próprio `PrismaClient` lendo `process.env.DATABASE_URL`, contornando a config e os repositórios. A R2 obriga todo acesso a passar pelo client de `repositories/prisma.ts`.
- **R3, seed idempotente.** A seed usava `prisma.user.create` e quebrava na segunda subida com `Unique constraint failed on the fields: (email)`. O `CLAUDE.md` antigo mandava "nunca rodar a seed duas vezes" e "`docker compose down -v`" em vez de corrigir. A R3 trava a volta do `create`.
- **R4, worker só orquestra.** O worker tinha regra de negócio e acesso a banco inline. Agora ele só chama o `TriageService`, montado em `api/src/composition.ts`. A R4 impede que `jobs/` volte a falar direto com Prisma, com repositórios ou com o cliente de IA.

## Como aplicar os exemplos das regras próprias

Cada regra própria tem uma violação versionada em `kit-gates/violacoes/R*`, no formato do kit (manifesto + arquivo `.modelo`). Com o `git status` limpo e as dependências instaladas (`npm run up`):

```bash
bash kit-gates/verificar.sh . "npm run gates" R1
bash kit-gates/verificar.sh . "npm run gates" R2
bash kit-gates/verificar.sh . "npm run gates" R3
bash kit-gates/verificar.sh . "npm run gates" R4
```

O kit copia o arquivo para o lugar, roda os gates, confere a linha `R<n> <arquivo>` e desfaz tudo. Para aplicar só à mão, copie o arquivo sem o sufixo `.modelo` para o mesmo caminho relativo, por exemplo:

```bash
cp kit-gates/violacoes/R2-segundo-prisma-client/arquivos/api/src/services/conexao-extra.ts.modelo api/src/services/conexao-extra.ts
npm run gates   # falha com "R2 api/src/services/conexao-extra.ts"
rm api/src/services/conexao-extra.ts
```

## Depois de mexer numa ferramenta de gate

Rode o kit inteiro: `bash kit-gates/verificar.sh . "npm run gates"`. Uma opção errada pode desligar uma regra sem aviso, e isso já aconteceu aqui (ver `docs/incidentes.md`).
