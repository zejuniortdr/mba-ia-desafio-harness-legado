# Balcão

Central de chamados. Clientes abrem chamados, uma IA faz a triagem (categoria e prioridade) em segundo plano, atendentes assumem, respondem e resolvem, e o admin acompanha as estatísticas.

- `api/`: API em Express + Prisma e o worker de triagem (processo separado).
- `web/`: front em React + Vite.
- `blackbox/`: testes caixa-preta da API (o contrato HTTP).
- `kit-gates/`: kit que testa os gates plantando violações.

Agentes de código: comecem pelo [AGENTS.md](AGENTS.md).

## Como rodar

### Pré-requisitos

- Linux ou macOS (no Windows, WSL), com bash.
- Node.js LTS (22 ou superior) e npm.
- Docker com `docker compose` v2.
- Git.

### Comandos

Todos rodam na raiz do repositório.

| Comando | O que faz |
|---|---|
| `npm run up` | Sobe o Balcão inteiro desta cópia: instala as dependências com `npm ci`, sobe um Postgres próprio, aplica as migrations, roda a seed, sobe API, worker e front e ativa o hook do Git. Pode rodar de novo sem derrubar antes. |
| `npm run down` | Derruba tudo que o `up` desta cópia iniciou (API, worker, front e o Postgres dela). Os dados ficam no volume para a próxima subida. Outras cópias não são afetadas. |
| `npm run gates` | Roda todas as verificações e termina com a lista de violações, uma por linha (`G4 api/src/http/routes/stats.ts`). Sai com código diferente de zero se houver alguma. |

### O que a subida informa

```
Balcão no ar (cópia balcao-copia-a-1a2b3c)
  API:     http://localhost:4000
  Front:   http://localhost:5173
  Banco:   postgresql://balcao:balcao@localhost:5432/balcao (projeto docker compose balcao-copia-a-1a2b3c)
  Anexos:  /caminho/da/copia/.balcao/uploads
  Logs:    /caminho/da/copia/.balcao/logs
Derrubar: npm run down
```

As portas variam: a primeira subida de cada cópia escolhe portas livres a partir de 4000 (API), 5173 (front) e 5432 (banco) e grava as escolhidas em `.balcao/env`. Abra o front pelo endereço impresso.

A IA roda em modo fake por padrão (`AI_MODE=fake` em `api/.env`): classifica por palavras-chave e não precisa de chave. Para usar a OpenAI, ponha `AI_MODE=openai` e `OPENAI_API_KEY` no `api/.env` e rode `npm run up` de novo. O `up` preserva essas chaves.

### Testes

- **Unitários**, sem banco: `cd api && npm test`.
- **Caixa-preta**, com a cópia no ar: `cd blackbox && npm ci && API_URL=<API impressa pelo up> npm test`.
- **Integração** (fora dos critérios do harness): o `up` grava em `api/.env` uma `DATABASE_URL_TEST` apontando para a base `balcao_test` do Postgres da cópia. Crie e migre essa base uma vez e rode `cd api && npm run test:integration`.

## Contas da seed

| Papel | E-mail | Senha |
|---|---|---|
| admin | `admin@balcao.dev` | `Admin@123` |
| atendente | `agente@balcao.dev` | `Agente@123` |
| cliente | `cliente@balcao.dev` | `Cliente@123` |

## Gates

O detalhe de cada regra fica em [docs/gates.md](docs/gates.md).

| ID | Regra | Ferramenta |
|---|---|---|
| G1 | Zero erro de tipo em `api/` e `web/` | `tsc --noEmit` |
| G2 | Lint sem erro nem warning (variável/import sem uso, `any` explícito) | ESLint + typescript-eslint |
| G3 | Testes unitários da API passam | vitest |
| G4 | `api/src/http/` não importa `@prisma/client` nem `repositories/` | dependency-cruiser |
| G5 | `process.env` só em `api/src/config/`; `import.meta.env` só em `web/src/config/` | regra ESLint própria (AST) |
| G6 | `api/src/services/` não importa `express`, `multer` nem `http/`, nem só tipo | dependency-cruiser (`tsPreCompilationDeps`) |
| G7 | `openai` só em `api/src/integrations/` | dependency-cruiser |
| G8 | `web/` não importa nada de `api/`, nem só tipo | dependency-cruiser (`tsPreCompilationDeps`) |
| G9 | Nenhum import circular em `api/src/` e `web/src/` | dependency-cruiser |
| G10 | Nenhum arquivo, export (inclusive de tipo) ou dependência sem uso | knip |
| R1 | Nenhum host local ou porta padrão fixos fora de `config/` | regra ESLint própria (AST) |
| R2 | `new PrismaClient` só em `api/src/repositories/prisma.ts` | regra ESLint própria (AST) |
| R3 | A seed só cria usuário com `upsert` (idempotente) | regra ESLint própria (AST) |
| R4 | `api/src/jobs/` não importa Prisma, repositórios nem integrações | dependency-cruiser |

O hook `.githooks/pre-commit` roda `npm run gates` antes de cada commit e bloqueia o commit se houver violação. Ele cobre tipo (G1), lint (G2) e todo o resto. O `npm run up` ativa o hook (`git config core.hooksPath .githooks`).

### Exemplos de violação das regras próprias

Cada regra própria tem uma violação versionada em `kit-gates/violacoes/R1-*` a `R4-*`, no formato do kit. Para aplicar, com o `git status` limpo e depois de um `npm run up`:

```bash
bash kit-gates/verificar.sh . "npm run gates" R1   # troque por R2, R3 ou R4
```

O kit copia o arquivo de exemplo, roda os gates, confere a linha `R<n> <arquivo>` e desfaz tudo. Para rodar o kit inteiro (G1 a G10 e R1 a R4): `bash kit-gates/verificar.sh . "npm run gates"`.

## Decisões

### Como as cópias foram isoladas

- **Identidade:** cada cópia (clone ou worktree) vira um projeto docker compose `balcao-<pasta>-<hash do caminho>`. Com isso tem o próprio container e o próprio volume do Postgres. O `docker-compose.yml` publica a porta `${DB_PORT}`.
- **Portas:** escolhidas livres na primeira subida e gravadas em `.balcao/env`. Nas subidas seguintes são reaproveitadas, a menos que outro processo tenha tomado alguma delas.
- **Configuração:** o `up` gera o `api/.env` da cópia com `DATABASE_URL`, `PORT`, `UPLOAD_DIR` e `WEB_ORIGIN` (para o CORS) e sobe o front com `VITE_API_URL` apontando para a API da mesma cópia. O código lê tudo isso só por `api/src/config/` e `web/src/config/`.
- **Anexos:** em `.balcao/uploads/` da cópia, em vez de `/tmp/balcao/uploads` compartilhado.
- **Processos:** API, worker e front rodam no host, cada um no próprio grupo de processos, com os PIDs em `.balcao/pids/`. O `down` encerra os grupos desta cópia e o projeto compose dela, e nada mais.
- **Seed:** idempotente. Usuários entram por `upsert` e os chamados de exemplo só são criados se ainda não existirem. Por isso a subida repetida não quebra nem duplica nada.

### Como as violações que já existiam foram corrigidas

Os gates acusaram 46 violações no código original, corrigidas sem supressão nem exclusão de arquivo:

- **G5:** toda leitura de ambiente passou para `api/src/config/env.ts` (validada com zod, com os mesmos padrões de antes) e `web/src/config/env.ts`.
- **G6:** o erro de aplicação virou `AppError` em `api/src/domain/errors.ts`. O upload recebe um `UploadedFile` do domínio em vez do `Request` do Express.
- **G4 e G7:** `api/src/main.ts` monta os serviços (`api/src/composition.ts`) e chama `createApp(services)`. As rotas viraram fábricas que só conhecem serviços. Estatísticas, health e sugestão de resposta ganharam serviço próprio. A sugestão passa por `integrations/ai-client`, com a mesma resposta no modo fake.
- **R2 e R4:** o worker só chama o `TriageService` e usa o client Prisma único.
- **G8:** o front tem os próprios tipos do contrato HTTP, sem importar de `api/`.
- **G9:** `formatTicketRef` foi para `domain/`, quebrando o ciclo entre `ticket-service` e `notification-service`.
- **G2 e G10:** os `any` viraram tipos reais. Saíram código e dependências sem uso: `utils/legacy-sla.ts`, `lodash`, `axios` e exports que ninguém usava.

A suíte caixa-preta (51 testes) passou antes e depois de cada etapa.

### O que mudou na documentação para agentes

- O `CLAUDE.md` antigo citava pastas que não existem (`controllers/`, `api/tests/`), um comando que não existe (`npm run migrate`) e práticas que o harness proíbe (`any` para destravar, `kill -9` na porta, nunca rodar a seed duas vezes). Ele agora só aponta para o `AGENTS.md`.
- O `AGENTS.md` (menos de 60 linhas) é o índice: subir, derrubar, gates, contas, regras de camada e onde está o detalhe. Todo comando e caminho citado nele existe.
- O detalhe ficou em `docs/gates.md` e `docs/design/`, e o aprendizado com os erros dos agentes, em `docs/incidentes.md`.

## Registro de incidentes

[docs/incidentes.md](docs/incidentes.md)

## Problemas comuns

- **Chamado parado em "Em triagem":** veja `.balcao/logs/worker.log` e rode `npm run up` de novo.
- **A subida falhou:** a mensagem mostra o fim do log que falhou. Os logs completos ficam em `.balcao/logs/`.
- **Erro de CORS no navegador:** abra o front pelo endereço exato que o `up` imprimiu (`localhost`, não `127.0.0.1`).
