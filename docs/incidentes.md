# Registro de incidentes

Erros reais cometidos por agentes (Claude Code) durante a instalação do harness. Cada entrada registra o que aconteceu, a mudança no harness que impede a repetição e o commit dessa mudança (`git show --stat <hash>`).

## 1. Worker subiu na pasta errada e a triagem parou

- **O que aconteceu:** para medir a linha de base, o agente subiu API e worker num comando só: `(cd api && nohup npm run start & ...; nohup npm run worker &)`. O `cd api &&` foi junto com o primeiro processo para o background, e o worker rodou na raiz, onde não existe `package.json`. A API respondia, mas nada era triado: 6 testes da caixa-preta falharam com "continua em triagem depois de 15000ms".
- **Mudança no harness:** o `npm run up` (`scripts/up.sh`) sobe cada processo pela função `start`, com o diretório de trabalho explícito (`cd "$dir" && exec ...`). Depois espera `/api/health` e confere que o worker continua vivo antes de dizer que subiu.
- **Commit:** `2b9e2aa`

## 2. API velha ficou presa na porta 4000

- **O que aconteceu:** o agente gravou o `$!` do subshell em vez do PID do `setsid npm` e "matou" a API da linha de base pelo PID errado. A API antiga continuou escutando na 4000. Na subida seguinte, a cópia foi para outra porta sem nenhum problema aparente, e só uma conferência com `ss -ltnp` mostrou o processo órfão.
- **Mudança no harness:** os scripts gravam o líder de cada grupo de processos (`set -m`), param o grupo inteiro e esperam até ele sumir antes de reaproveitar a porta (`2b9e2aa`). O `AGENTS.md` proíbe subir processo à mão e matar por porta: só `npm run up` e `npm run down` (`ecc4403`).
- **Commits:** `2b9e2aa`, `ecc4403`

## 3. Configuração do dependency-cruiser desligou G6, G7 e R4 sem aviso

- **O que aconteceu:** o agente pôs `exclude: node_modules` na configuração do dependency-cruiser para não analisar pacotes. Isso também tirou da análise as dependências para pacotes. `import type { Request } from 'express'` num serviço (G6), `openai` numa rota (G7) e `@prisma/client` no worker (R4) passaram em silêncio, com os gates verdes nessas regras.
- **Mudança no harness:** o `exclude` cobre só `dist/` e os alvos são passados explicitamente: `api/src`, `api/prisma`, `api/test`, `web/src` e `web/vite.config.ts` (`daddd64`). O `docs/gates.md` e o `AGENTS.md` mandam rodar o `kit-gates` inteiro depois de mexer em qualquer configuração de gate (`ecc4403`).
- **Commits:** `daddd64`, `ecc4403`

## 4. R2 deixava passar PrismaClient com alias

- **O que aconteceu:** a primeira versão da R2 só procurava `new PrismaClient(...)`. Na rodada de variantes, `import { PrismaClient as P } from '@prisma/client'; new P()` passou.
- **Mudança no harness:** a regra `balcao/R2` (`eslint.config.mjs`) registra os nomes locais de cada `import { PrismaClient as X }` e barra `new X()`, além de `new algo.PrismaClient()`.
- **Commit:** `daddd64`

## 5. `npm uninstall` reescreveu o lockfile inteiro

- **O que aconteceu:** para tirar `lodash` e `axios` (sem uso, G10), o agente rodou `npm uninstall`. O npm 12 da máquina reescreveu metadados em dezenas de entradas do `api/package-lock.json` (`"peer": true`), num diff que não tinha nada a ver com a mudança. O agente desfez e removeu só as entradas da dependência e dos pacotes órfãos, conferindo com `npm ci`.
- **Mudança no harness:** o `AGENTS.md` proíbe `npm install` para "arrumar" o ambiente, manda conferir o `git diff` do lockfile ao adicionar dependência e deixa a instalação a cargo do `npm run up`, que usa `npm ci`.
- **Commit:** `ecc4403`

## 6. `npm run up` podia travar no macOS

- **O que aconteceu:** a revisão final, feita por um agente revisor, encontrou o erro na `scripts/up.sh` escrita pelo agente. Os processos em background herdavam o stdin de quem chamou. No Linux o `nohup` redireciona o stdin quando ele é um terminal; no macOS não. Num terminal interativo do macOS, o vite liga os atalhos de teclado, lê o terminal estando num grupo em background e para com SIGTTIN. A porta aceita conexão, ninguém responde, e a espera HTTP ficava pendurada sem timeout. Conferido no Linux: o stdin dos três processos era o socket de quem chamou, e não `/dev/null`.
- **Mudança no harness:** cada processo sobe com `< /dev/null`, e a espera HTTP usa `AbortSignal.timeout(2000)`, para nunca travar sem mensagem.
- **Commit:** `efd1d7e`

## 7. G5 deixava passar `process.env` escrito de outro jeito

- **O que aconteceu:** a regra G5 do agente só reconhecia `process.env`, `process['env']`, `const { env } = process` e `import.meta.env`. A revisão achou 10 formas que passavam, entre elas `(process as NodeJS.Process).env`, ``process[`env`]``, `const p = process; p.env`, `Reflect.get(process, 'env')` e `const m = import.meta; m.env`. Além disso, arquivos `.js`, `.mjs` e `.jsx` em `api/src` e `web/src` ficavam fora do ESLint e do knip.
- **Mudança no harness:**
  - A G5 usa a análise de escopo do ESLint: qualquer referência ao `process` global, ou a `import.meta`, fora de `config/` é barrada. A exceção é o acesso direto a outra propriedade (`process.exit`, `import.meta.url`).
  - Os globs do ESLint e do knip cobrem `ts`, `tsx`, `mts`, `cts`, `js`, `jsx`, `mjs` e `cjs`.
  - O kit inteiro foi rodado de novo: 23 de 23 barradas.
- **Commit:** `a7c0cba`
