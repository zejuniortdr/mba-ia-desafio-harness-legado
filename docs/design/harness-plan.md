# Harness do Balcão: plano de implementação

> **Para agentes:** use superpowers:executing-plans (ou subagent-driven-development) tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** subir, isolar, verificar e documentar o Balcão para vários agentes em paralelo, sem mudar o comportamento da API.

**Arquitetura:** scripts bash na raiz (up/down) com um Postgres por cópia via compose; `scripts/gates.mjs` orquestra tsc, ESLint, vitest, dependency-cruiser e knip e normaliza a saída em `ID arquivo`; a API é refatorada para injeção de dependência a partir de `main.ts`.

**Stack:** Node LTS, Express 4, Prisma 6, Postgres 16, React 19, Vite 8, ESLint 9 + typescript-eslint, dependency-cruiser, knip, vitest.

**Spec:** `docs/design/harness-design.md` e `ENUNCIADO.md`.

## Restrições globais

- Pastas e entradas fixas não mudam de lugar: `api/src/{main.ts,config,domain,http,services,repositories,integrations,jobs/triage-worker.ts}`, `web/src`, `web/src/main.tsx` e o padrão `api/src/**/*.test.ts`.
- Nenhuma supressão (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) em `api/src` e `web/src`; nenhum arquivo dessas pastas fora das ferramentas.
- A API responde exatamente como antes. A suíte `blackbox/` passa antes e depois de cada tarefa de código.
- Scripts em bash 3.2 (macOS), sem `make` e sem `setsid`. Instalação sempre com `npm ci`.
- Commits em pt-BR, Conventional Commits, na branch `harness`. Sem push.
- Cada erro real de agente vira uma entrada em `docs/incidentes.md`, com o commit do harness que o impede.

## Pontos de revisão

1. Subida repetida com os processos da cópia ainda vivos: reinicia sem `EADDRINUSE` e sem duplicar a seed.
2. Porta gravada tomada por um processo de fora entre duas subidas: a subida escolhe outra e regrava.
3. Duas cópias: o CORS da API A recusa o front B e cada front fala só com a sua API (`VITE_API_URL`).
4. `tsx watch` gera processo filho: o down mata o grupo de processos inteiro, sem deixar órfão segurando porta.
5. Violação escrita de outra forma (`import type`, `export ... from`, `import()` dinâmico, `process['env']`, `const { env } = process`): os gates pegam igual.

---

### Tarefa 0: Linha de base

- [ ] Subir uma vez pelo README antigo e rodar `cd blackbox && npm ci && API_URL=http://localhost:4000 npm test`. Anotar o resultado (esperado: tudo passa).
- [ ] Rodar a subida pela segunda vez e confirmar o erro da seed (e-mail único). Esse vira o incidente da seed se um agente o cometer.
- [ ] Derrubar tudo (`docker compose down`).

### Tarefa 1: Configuração centralizada (G5, base da R1)

**Arquivos:** `api/src/config/env.ts`, `web/src/config/env.ts` (novo) e todos os lugares que hoje leem env (`main.ts`, `http/app.ts`, `http/middlewares/auth.ts`, `services/attachment-service.ts`, `integrations/ai-client.ts`, `jobs/triage-worker.ts`, `http/routes/tickets.ts`, `web/src/api/client.ts`, `web/src/api/tickets.ts`, `web/src/pages/TicketDetailPage.tsx`).

**Produz:** `env` com `DATABASE_URL`, `NODE_ENV`, `PORT: number` (padrão 4000), `JWT_SECRET` (padrão `dev-secret`), `AI_MODE: 'fake' | 'openai'` (padrão `fake`), `OPENAI_API_KEY` (opcional), `UPLOAD_DIR` (padrão `/tmp/balcao/uploads`), `WEB_ORIGIN` (padrão `http://localhost:5173`) e `TRIAGE_INTERVAL_MS: number` (padrão 2000). No front: `export const API_URL: string` (padrão `http://localhost:4000`).

- [ ] Ampliar o schema zod com os padrões de hoje. Trocar cada leitura de env pelo import de `config`. O CORS usa `env.WEB_ORIGIN`.
- [ ] `rg -n "process\.env|import\.meta\.env" api/src web/src`: só sobra `config/`.
- [ ] `cd api && npm test` passa; a caixa-preta passa contra a API subida.
- [ ] Commit `refactor(api,web): centraliza leitura de env em config`.

### Tarefa 2: Ambiente por cópia (up/down)

**Arquivos:** `package.json` da raiz (novo: scripts `up`, `down`, `gates`, com devDeps de gate depois), `scripts/up.sh`, `scripts/down.sh`, `scripts/lib.sh` (identidade da cópia e portas), `docker-compose.yml`, `.gitignore` (`.balcao/`), `api/.env.example`, `api/prisma/seed.ts`.

**Produz:** estado em `.balcao/{env,pids/,logs/,uploads/}`. Projeto compose `balcao-<basename>-<sha1(caminho)[0:6]>`. Variáveis `DB_PORT`, `API_PORT` e `WEB_PORT` em `.balcao/env`.

- [ ] Compose: `ports: ["${DB_PORT:-5432}:5432"]` e healthcheck `pg_isready -U balcao`.
- [ ] Seed: `upsert` de usuário por e-mail; cada chamado de exemplo só é criado se não existir chamado do cliente com aquele título.
- [ ] `lib.sh`: `copy_id`, `port_free <porta>` (tenta conectar em `/dev/tcp/127.0.0.1/<porta>`; porta livre = conexão recusada) e `pick_port <base>`.
- [ ] `up.sh`: hook (`git config core.hooksPath .githooks`), portas, `npm ci` condicionado ao carimbo do lockfile (raiz, `api` e `web`), `api/.env`, `docker compose -p $ID up -d --wait`, `npx prisma migrate deploy`, `npm run seed`, para os PIDs antigos, sobe com `set -m` (`npm run dev` / `npm run worker` em `api`, `npx vite --port $WEB_PORT --strictPort` em `web`, com `VITE_API_URL`), espera `/api/health` 200 e o front 200 (máximo de 60 s, mostrando a cauda do log se falhar) e imprime `API`, `Front`, `Banco` e `Anexos`.
- [ ] `down.sh`: `kill -TERM -<pgid>` para cada PID gravado, esperar, `kill -KILL` se ainda estiver vivo, e `docker compose -p $ID down`.
- [ ] `vite.config.ts`: tirar `port: 5173` fixo (a porta vem do CLI), manter `strictPort`.
- [ ] Verificar: `npm run up` duas vezes seguidas, sem erro; login dos 3 da seed por curl; `git worktree add ../copia-b`, up nela com portas, banco e anexos diferentes; caixa-preta passa contra as duas; o down de B mantém o health de A; up de B de novo; down das duas.
- [ ] Commit `feat(harness): up/down com cópias isoladas` (+ o fix da seed em commit próprio).

### Tarefa 3: Ferramentas de gate e agregador

**Arquivos:** `package.json` + `package-lock.json` da raiz, `eslint.config.mjs`, `.dependency-cruiser.cjs`, `knip.json` (ou um por pacote), `scripts/gates.mjs`.

**Produz:** `npm run gates`, que imprime `== violações ==` e linhas `^(G\d+|R\d+) <caminho a partir da raiz>( <dep>)?$`, e sai com 1 se houver alguma.

- [ ] ESLint flat: `js.configs.recommended` + `tseslint.configs.recommended` em `api/src`, `api/prisma`, `api/test` e `web/src`; `no-unused-vars` e `no-explicit-any` como erro. G5: `no-restricted-syntax` para `MemberExpression[object.name='process'][property.name='env']`, acesso computado `process['env']`, desestruturação de `process` e `MetaProperty` seguido de `.env`, com a mensagem prefixada `[G5]`, ignorando só `api/src/config/**` e `web/src/config/**`. R1, R2 e R3 também como seletores, com prefixo `[Rn]`.
- [ ] dependency-cruiser: `tsPreCompilationDeps: true`, `tsConfig` por pacote, `combinedDependencies`. Regras com `name` igual ao ID: G4 (`^api/src/http/` para `@prisma/client` e `^api/src/repositories/`), G6 (`^api/src/services/` para `express`, `multer` e `^api/src/http/`), G7 (`openai` fora de `^api/src/integrations/`), G8 (`^web/` para `^api/`), G9 (`circular: true` em `api/src` e `web/src`), R4 (`^api/src/jobs/` para `@prisma/client`, `^api/src/repositories/` e `^api/src/integrations/`).
- [ ] knip: workspaces `api` (entradas `src/main.ts`, `src/jobs/triage-worker.ts`, `prisma/seed.ts`, `test/**/*.test.ts` e `src/**/*.test.ts`) e `web` (`src/main.tsx`), com `includeEntryExports` e tipos.
- [ ] `gates.mjs`: roda tudo em sequência com `spawnSync`, sem parar na falha, faz o parse de tsc (texto), ESLint (`-f json`), vitest (`--reporter=json`), depcruise (`-T json`) e knip (`--reporter json`) e imprime a lista ordenada e sem repetição. Se uma ferramenta falhar sem gerar saída que dê para analisar, vira a linha `<ID> <pacote>` (ex.: `G1 api`), para nunca passar em silêncio.
- [ ] Verificar: `npm run gates` lista as violações atuais (esperado: muitas). `bash kit-gates/verificar.sh . "npm run gates"` exige git limpo e linha de base passando, então vale só na Tarefa 8. Antes disso, plantar manualmente 1 violação de cada kit (G4-b, G6-a, G8, G9-a, G10-b) e conferir a linha.
- [ ] Commit `feat(harness): comando de gates G1-G10`.

### Tarefa 4: Erros de domínio e upload sem Express (G6)

**Arquivos:** `api/src/domain/errors.ts` (novo: `export class AppError extends Error { constructor(public status: number, public code: string, message: string) }`), `api/src/domain/upload.ts` (novo: `export type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer }`), `services/*`, `http/errors.ts` (o `errorHandler` trata `AppError`; `HttpError` sai), testes `services/*.test.ts`.

- [ ] `AttachmentService.upload(user: CurrentUser, ticketId: string, file: UploadedFile | undefined)`. Atualizar o teste existente para a assinatura nova antes de mudar o código (o teste falha, depois passa).
- [ ] `npm test` passa e a caixa-preta passa (cobre os 413/415/422).
- [ ] Commit.

### Tarefa 5: Composição e rotas sem repositório (G4, G7)

**Arquivos:** `api/src/main.ts`, `api/src/composition.ts` (novo: `export function buildServices(): Services`), `http/app.ts` (`export function createApp(s: Services): Express`), rotas viram `export function xRoutes(s): Router`, `services/stats-service.ts`, `services/health-service.ts` (ou um método `ping()`), `services/suggestion-service.ts`, `repositories/ticket-repository.ts` (+`countBy(field)`), `repositories/prisma.ts` (+`ping()`), augmentation de `req.user` em `http/`.

**Produz:** `type Services = { auth: AuthService; users: UserLookup; tickets: TicketService; attachments: AttachmentService; stats: StatsService; health: HealthService; suggestions: SuggestionService }`.

- [ ] Teste novo `services/stats-service.test.ts`: com o repositório fake devolvendo linhas por status, categoria e prioridade, `getStats()` devolve `{ byStatus, byCategory, byPriority }` com os zeros e o `untriaged`, como hoje.
- [ ] Teste novo `services/suggestion-service.test.ts`: agente pede sugestão e recebe o texto fake com o nome do cliente; cliente recebe 403 `forbidden`; cliente inexistente vira `'cliente'`.
- [ ] Implementar; o suggest usa `integrations/ai-client.suggestReply`.
- [ ] `npm test` e a caixa-preta passam. Commit.

### Tarefa 6: Worker via serviço (R2, R4)

**Arquivos:** `services/triage-service.ts` (novo: `runOnce(): Promise<void>`), teste ao lado, `repositories/ticket-repository.ts` (+`findPendingTriage(limit)`, `markTriaged`, `markTriageFailed`), `jobs/triage-worker.ts` (só o loop + `buildServices()`).

- [ ] Teste: um chamado pendente com "fatura urgente" vira `billing/urgent`, `done`; `[falha-ia]` vira `failed`.
- [ ] Implementar. A caixa-preta `triage.test.ts` passa.
- [ ] Commit.

### Tarefa 7: Zerar G1, G2, G9 e G10

- [ ] `formatTicketRef` vai para `domain/ticket.ts` (quebra o ciclo com notification-service).
- [ ] Rodar `npm run gates` e corrigir em lote pela saída: `any`, variáveis sem uso, exports sem uso, `utils/legacy-sla.ts`, `lodash` e o que mais o knip apontar. Cada remoção é conferida com `rg`.
- [ ] `npm run gates` sai com 0; a caixa-preta passa. Commit.

### Tarefa 8: Hook, regras próprias e kit

**Arquivos:** `.githooks/pre-commit` (`#!/usr/bin/env bash` + `npm run gates`, comentário dizendo que inclui tipo e lint), `kit-gates/violacoes/R1-*`, `R2-*`, `R3-*` e `R4-*` (manifesto + `.modelo`, mesmo formato). R3 altera `api/prisma/seed.ts`: se o kit não suportar alterar arquivo existente, usar um `.patch` em `kit-gates/regras-proprias/` aplicado com `git apply`.

- [ ] Ler `kit-gates/verificar.sh` inteiro para saber o formato do manifesto.
- [ ] `bash kit-gates/verificar.sh . "npm run gates"` sai com 0 (tudo `barrada`), incluindo R1–R4.
- [ ] Hook: os dois commits do passo 7 do avaliador são bloqueados.
- [ ] Commit.

### Tarefa 9: Documentação

- [ ] `AGENTS.md` (≤ 60 linhas), `CLAUDE.md` (aponta para `AGENTS.md`), `README.md` (seções do Entregável), `docs/incidentes.md` (≥ 3, com hash).
- [ ] Rodar cada comando e conferir cada caminho citado no `AGENTS.md`.
- [ ] Commit.

### Tarefa 10: Fluxo do avaliador, de ponta a ponta

- [ ] Clone novo numa pasta vazia, passos 1 a 11 do enunciado (inclui o front no navegador; se não der para clicar, conferir por curl e pedir ao usuário que valide o front).
- [ ] Revisão final do diff da branch (diff-reviewer).
- [ ] Merge sem squash na `main` local, depois da validação do usuário. Sem push.
