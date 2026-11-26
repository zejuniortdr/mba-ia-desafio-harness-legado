# AGENTS.md: Balcão

Central de chamados. API Express + Prisma em `api/`, worker de triagem em `api/src/jobs/triage-worker.ts` (processo separado), front React + Vite em `web/`, suíte caixa-preta em `blackbox/`.

## Ambiente (cada clone ou worktree é uma cópia isolada)

- Subir: `npm run up` na raiz. Instala com `npm ci`, sobe um Postgres só desta cópia, migra, roda a seed, sobe API, worker e front e imprime as URLs da API e do front, o banco e a pasta de anexos. Pode rodar de novo sem derrubar.
- Derrubar: `npm run down`. Afeta só esta cópia; os dados do banco ficam para a próxima subida.
- Logs, portas e anexos da cópia ficam em `.balcao/` (criado pelo up). `api/.env` também é gerado pelo up.
- Não suba processo à mão nem mate processo por porta: use up/down.
- A IA roda em modo fake por padrão (`AI_MODE=fake`), sem chave.

## Antes de dizer que terminou

- `npm run gates` termina com `== violações (0) ==`. A lista traz `<ID> <arquivo>` (ex.: `G4 api/src/http/routes/stats.ts`): corrija pela saída.
- Testes unitários: `cd api && npm test`.
- Caixa-preta, com a cópia no ar: `cd blackbox && npm ci && API_URL=<API impressa pelo up> npm test`.
- O hook `.githooks/pre-commit` roda os gates em cada commit. Não use `--no-verify`.
- Mexeu em `eslint.config.mjs`, `.dependency-cruiser.cjs`, `knip.json` ou `scripts/gates.mjs`? Rode `bash kit-gates/verificar.sh . "npm run gates"` (exige git limpo).

## Proibido

- `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck` ou tirar arquivo de uma ferramenta para passar no gate.
- `any` explícito; variável, import, export, arquivo ou dependência sem uso.
- Mudar a API HTTP (rotas, corpos, status, códigos de erro): a suíte `blackbox/` é o contrato.
- `npm install` para "arrumar" o ambiente: ele reescreve o `package-lock.json`. Para dependência nova, `npm install <pacote>` dentro do pacote e confira o `git diff` do lockfile.

## Regras de camada (os IDs são os dos gates)

- `api/src/http/`: rotas são fábricas que recebem `AppServices` (`api/src/http/services.ts`). Não importa `@prisma/client` nem `repositories/` (G4).
- `api/src/services/`: regra de negócio. Não importa `express`, `multer` nem `http/`, nem só tipo (G6). Erro de aplicação é `AppError` (`api/src/domain/errors.ts`).
- `api/src/repositories/`: único lugar com Prisma. `new PrismaClient` só em `api/src/repositories/prisma.ts` (R2).
- `api/src/integrations/`: único lugar com `openai` (G7).
- `api/src/config/` e `web/src/config/`: único lugar com `process.env`/`import.meta.env` (G5), host e porta (R1).
- `api/src/composition.ts` liga repositórios aos serviços; `api/src/main.ts` e o worker usam esse ponto. `api/src/jobs/` não importa Prisma, repositórios nem integrações (R4).
- `web/` não importa nada de `api/` (G8). Sem import circular (G9). A seed (`api/prisma/seed.ts`) é idempotente e usa `upsert` para usuários (R3).

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Onde está o detalhe

- `README.md`: como rodar, decisões e problemas comuns.
- `docs/gates.md`: cada regra, a ferramenta e a motivação das regras próprias.
- `docs/incidentes.md`: erros de agentes e a mudança no harness que cada um gerou.
- `docs/design/harness-design.md`: o desenho do harness.
