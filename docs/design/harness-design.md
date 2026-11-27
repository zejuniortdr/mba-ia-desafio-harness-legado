# Design: harness do Balcão

Data: 2026-11-26. Fonte dos requisitos: `ENUNCIADO.md`.

## Intenção

Fazer qualquer agente subir o Balcão, mexer no código e provar que não quebrou nada, sem ninguém do lado e com várias cópias (worktrees) em paralelo. O código passa a respeitar as regras porque as violações foram corrigidas, sem supressões. Nenhuma mudança de comportamento na API.

## Objetivos, não-objetivos e anti-objetivos

- Objetivos: `npm run up` / `npm run down` / `npm run gates` na raiz; isolamento total por cópia; G1–G10 mais 4 regras próprias; hook pre-commit; `AGENTS.md` ≤ 60 linhas; `CLAUDE.md` apontando para ele; README para humanos; `docs/incidentes.md`.
- Não-objetivos: features novas, CI/deploy, troca de stack, testes de integração, IA real, visual do front.
- Anti-objetivos (fracasso mesmo "funcionando"): gate que só pega as violações do kit; supressão ou exclusão de arquivo; qualquer resposta HTTP diferente; o down de uma cópia afetando outra; um comando do `AGENTS.md` que não roda.

## Restrições

- Máquina do avaliador: Linux ou macOS, Docker, Git e Node LTS. Sem `make` e sem `setsid` (macOS). Bash compatível com 3.2.
- Pastas e entradas fixas intactas (lista do enunciado).
- Instalação com `npm ci`, que respeita os lockfiles.
- Tudo na `main` do fork. Trabalho na branch `harness`, com merge sem squash na `main` depois da validação local do usuário (para preservar os hashes dos incidentes). Sem push até a validação.
- Commits em pt-BR, Conventional Commits.

## Abordagens (decididas com o usuário)

| Tema | Escolhida | Descartada e por quê |
|---|---|---|
| Banco | 1 Postgres por cópia (projeto compose próprio, volume próprio) | Postgres único com uma base por cópia: o down não pode derrubar o container e alguém precisa ser dono dele |
| Processos | Node no host, em background, com PIDs e logs na cópia | Tudo no compose: Dockerfiles, node_modules no container, mais peças |
| Portas | Procura porta livre na primeira subida e grava; reaproveita depois | Hash do caminho: pode colidir |
| Hook | `.githooks/pre-commit` + `git config core.hooksPath .githooks` feito pelo up | husky: dependência a mais e package na raiz só para isso |
| Comandos | npm scripts na raiz chamando `scripts/*.sh` / `scripts/gates.mjs` | Bash direto: perde o lugar único para as ferramentas de gate |
| Gates arquiteturais | dependency-cruiser | Só ESLint: `import/no-cycle` lento, `import type` tratado de formas diferentes |
| Regras próprias | as 4 propostas (R1–R4, abaixo) | — |
| Incidentes | erros reais meus e de subagentes nesta sessão | — |

## Desenho

### 1. Ambiente (`scripts/up.sh`, `scripts/down.sh`)

Estado da cópia em `.balcao/` (gitignored): `env` (portas escolhidas), `pids/`, `logs/`, `uploads/`.

- Identidade da cópia: `balcao-<basename>-<6 primeiros caracteres do sha1 do caminho absoluto>`, usada como nome do projeto compose. O volume `pgdata` fica separado por projeto.
- `docker-compose.yml`: porta do host `${DB_PORT:-5432}:5432` e healthcheck `pg_isready`. Sem `container_name` fixo.
- up, em ordem:
  1. ativa o hook (`git config core.hooksPath .githooks`);
  2. carrega `.balcao/env` ou escolhe portas livres (DB a partir de 5432, API a partir de 4000, web a partir de 5173, pulando as que estiverem ocupadas por qualquer processo) e grava;
  3. `npm ci` na raiz, em `api/` e em `web/`, só se faltar `node_modules` ou se o lockfile mudou (carimbo com o hash do lockfile);
  4. gera `api/.env` a partir de `api/.env.example`, com DATABASE_URL, PORT, UPLOAD_DIR (absoluto), WEB_ORIGIN e AI_MODE=fake;
  5. `docker compose -p <id> up -d --wait`;
  6. `prisma migrate deploy` e depois a seed (idempotente);
  7. para os processos desta cópia que estiverem vivos (pelos PIDs, matando o grupo de processos) e sobe API, worker e web (`vite --port <web> --strictPort`, com `VITE_API_URL` apontando para a API desta cópia);
  8. espera `GET /api/health` responder 200 e o front responder;
  9. imprime a API, o front, o banco (URL e projeto compose) e a pasta de anexos.
- Rodar o up de novo sem down: reaproveita as portas gravadas e reinicia só os processos desta cópia. Se uma porta gravada tiver sido tomada por outro processo, escolhe outra e regrava.
- down: mata os grupos de processos dos PIDs gravados e roda `docker compose -p <id> down`, sem `-v`, para os dados ficarem para a próxima subida. Não toca em outra cópia.
- Processos em background com `set -m`, para cada um ganhar o próprio grupo de processos (funciona no macOS, que não tem `setsid`).

### 2. Código: o que muda para respeitar as regras

Comportamento HTTP idêntico. A suíte caixa-preta roda antes e depois de cada etapa.

- **Config (G5)**: `api/src/config/env.ts` lê e valida PORT, JWT_SECRET, AI_MODE, OPENAI_API_KEY, UPLOAD_DIR, WEB_ORIGIN, TRIAGE_INTERVAL_MS e DATABASE_URL, mantendo os mesmos padrões de hoje. `web/src/config/env.ts` exporta `API_URL`.
- **Erros (G6)**: a classe de erro de aplicação (status, code, message) sai de `http/errors.ts` e vai para `domain/` (ex.: `domain/errors.ts`). O `errorHandler` do http a traduz para JSON igual ao de hoje.
- **Upload (G6)**: `AttachmentService.upload(user, ticketId, file)` recebe um tipo de arquivo do domínio, sem `Request`. A rota tira o arquivo do multer e repassa.
- **Rotas (G4)**: `main.ts` vira a raiz de composição: cria repositórios e serviços e chama `createApp(services)`. As rotas viram fábricas que recebem os serviços. `stats` e `health` ganham serviço e métodos de repositório próprios (mesmas queries).
- **OpenAI (G7)**: o `suggest-reply` passa a usar `integrations/ai-client.suggestReply`, por meio de um serviço. O texto do modo fake é o mesmo de hoje. No modo openai fica valendo o prompt de `ai-client` (o enunciado deixa essa escolha livre).
- **Worker (R2, R4)**: o loop fica no `triage-worker.ts`. A regra vai para um serviço de triagem (repositório de tickets + `ai-client`), com o client Prisma único de `repositories/prisma.ts`.
- **Ciclo (G9)**: `formatTicketRef` sai de `ticket-service` (vai para `domain/` ou para `notification-service`) e quebra o ciclo com `notification-service`.
- **Código morto (G10)**: remover o que o knip apontar e que de fato não tem uso, por exemplo `utils/legacy-sla.ts`, `lodash` e exports sem uso. Cada remoção é conferida com grep e com a suíte caixa-preta.
- **Lint e tipos (G1/G2)**: troca de cada `any` por um tipo real (como `req.user` via augmentation do Express no http) e remoção de variáveis sem uso.
- **Seed (R3)**: usuários com `upsert` por e-mail. Os três chamados de exemplo só são criados se o cliente ainda não tiver chamado com aquele título. Nada duplica.
- **Endereço fixo (R1)**: CORS a partir de `config.WEB_ORIGIN`, URL do front a partir de `web/src/config`, sem fallback `localhost` fora de `config/`.

### 3. Gates (`npm run gates` → `node scripts/gates.mjs`)

Roda todas as etapas sem parar na primeira falha, junta tudo e termina com o bloco `== violações ==`, uma linha `<ID> <arquivo>[ <dependência>]` por violação. Sai com 1 se houver alguma.

| ID | Ferramenta | Como |
|---|---|---|
| G1 | `tsc --noEmit` em `api/` e em `web/` | parse de `arquivo(l,c): error` |
| G2 | ESLint (flat config na raiz, typescript-eslint recommended, `--max-warnings 0`) | `no-unused-vars`, `no-explicit-any` como erro; saída JSON |
| G3 | vitest (`api/`) com reporter JSON | arquivo de cada teste que falhou |
| G4, G6, G7, G8, G9 | dependency-cruiser com `tsPreCompilationDeps: true` (pega `import type`) | uma regra nomeada por ID; `no-circular` em `api/src` e `web/src` |
| G5 | ESLint `no-restricted-syntax` (`process.env`, `import.meta.env`) fora de `config/` | prefixo `[G5]` na mensagem |
| G10 | knip em `api/` e em `web/` | arquivos, exports e tipos sem uso, dependências sem uso (com o nome) |
| R1 | ESLint: literal com `localhost`/`127.0.0.1` ou porta 4000/5173/5432 em `api/src` e `web/src` fora de `config/` | prefixo `[R1]` |
| R2 | ESLint: `new PrismaClient` em `api/src` fora de `repositories/prisma.ts` | prefixo `[R2]` |
| R3 | ESLint em `api/prisma/seed.ts`: `user.create`/`createMany` proibidos (só `upsert`) | prefixo `[R3]` |
| R4 | dependency-cruiser: `api/src/jobs/` não importa `@prisma/client`, `repositories/` nem `integrations/` (o worker só fala com serviços e com a composição) | regra `R4` |

Ferramentas de gate como devDependencies do `package.json` da raiz, com lockfile próprio. As exceções ficam só onde a própria regra define (`config/` na G5 e na R1, `repositories/prisma.ts` na R2).

Exemplos de violação das regras próprias: `kit-gates/violacoes/R1-...` até `R4-...`, no mesmo formato do kit (manifesto + `.modelo`), aplicados com `bash kit-gates/verificar.sh . "npm run gates" R1`.

Hook `.githooks/pre-commit`: roda `npm run gates` completo (tipo, lint e o resto). Proposta: o gate inteiro, porque o teste do avaliador também cria arquivo sem uso; se ficar lento demais, reduzir para G1+G2 mais o que for rápido.

Composição para o worker (R4): o worker precisa de um serviço com repositório injetado. A montagem fica num módulo de composição fora de `jobs/` e de `http/` (ex.: `api/src/composition.ts`), usado por `main.ts` e por `triage-worker.ts`. O http não importa esse módulo: recebe os serviços por `createApp`.

### 4. Documentação

- `AGENTS.md` (≤ 60 linhas): subir, derrubar, gates, contas da seed, regras de camada e ponteiros para `docs/`.
- `CLAUDE.md`: uma linha apontando para `AGENTS.md`.
- `README.md` reescrito com as seções do Entregável.
- `docs/incidentes.md`: cada erro real → mudança no harness → hash do commit.

## Decisões minhas (para o usuário conferir)

1. Estado da cópia em `.balcao/` e anexos em `.balcao/uploads` (caminho absoluto impresso).
2. O down não apaga o volume do banco.
3. Subida repetida reinicia os processos da cópia em vez de deixá-los como estão.
4. `npm ci` condicionado ao carimbo do lockfile.
5. Hook roda os gates completos.
6. Raiz de composição em `main.ts` e no módulo `composition.ts`; rotas como fábricas.
7. Prompt de sugestão do modo openai unificado no de `ai-client`.
8. Seed: upsert dos usuários e criação condicional dos chamados de exemplo.
9. Revisão do design feita por mim, sem subagente, conforme a preferência global de delegação restrita.

## Fica para o builder

Os nomes exatos dos arquivos novos, a ordem dos commits, o texto do README e do AGENTS.md e o parse de cada ferramenta.
