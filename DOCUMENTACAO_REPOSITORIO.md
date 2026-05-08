# Documentação da lógica do repositório

## 1) Visão geral

Este repositório é um **monorepo TypeScript com pnpm workspace** focado em:

- Simulação farmacocinética de testosterona intramuscular (artifact principal: `artifacts/pk-simulator`)
- API backend em Express (`artifacts/api-server`)
- Contrato OpenAPI e geração de código (`lib/api-spec`, `lib/api-client-react`, `lib/api-zod`)
- Base para banco de dados com Drizzle (`lib/db`)

O sistema é majoritariamente escrito em **TypeScript** (frontend e backend), com build de frontend via **Vite** e backend via **esbuild**.

---

## 2) Estrutura principal do monorepo

- `artifacts/pk-simulator`  
  Aplicação React com interface do simulador PK (curvas, métricas, Monte Carlo, recomendação de intervalo).

- `artifacts/api-server`  
  API Express (hoje com endpoint de saúde `/api/healthz`), logging com Pino e build em ESM.

- `lib/api-spec`  
  Fonte do contrato OpenAPI (`openapi.yaml`) e configuração do Orval para gerar cliente e schemas.

- `lib/api-client-react`  
  Cliente HTTP/React Query gerado, com `custom-fetch.ts` para padronizar autenticação, parse e erros.

- `lib/api-zod`  
  Schemas e tipos gerados com Zod a partir do OpenAPI.

- `lib/db`  
  Conexão com PostgreSQL + Drizzle ORM, preparado para evoluir schema.

- `artifacts/mockup-sandbox`  
  Ambiente separado para preview de componentes/mockups.

- `scripts`  
  Pacote utilitário (ex.: script hello, typecheck de scripts).

---

## 3) Stack e linguagem

- Linguagem principal: **TypeScript**
- Frontend: **React 19**, **Vite**, **TanStack Query**, **Recharts**, componentes UI baseados em Radix/shadcn
- Backend: **Node.js**, **Express 5**, **Pino**
- API contract/codegen: **OpenAPI 3.1 + Orval + Zod**
- Banco: **PostgreSQL + Drizzle ORM**
- Workspace: **pnpm**

---

## 4) Lógica central de produto (simulador PK)

Arquivo central: `artifacts/pk-simulator/src/lib/pk-engine.ts`.

### Modelo farmacocinético

Implementa um modelo com:

1. Compartimento de absorção rápida (`qRap`)
2. Compartimento de absorção lenta (`qLen`)
3. Compartimento central (`qCen`)

Parâmetros principais (`ParametrosPK`):

- `ka_rapido`: velocidade de absorção rápida
- `ka_lento`: velocidade de absorção lenta
- `frac_rapido`: fração da dose no compartimento rápido
- `ke`: eliminação no compartimento central
- `S`: fator de escala para concentração clínica

As equações diferenciais são integradas por **Runge-Kutta de 4ª ordem (RK4)**.

### Variáveis/constantes clínicas relevantes

- Conversão: `NMOL_TO_NGDL`, `NGDL_TO_NMOL`
- Faixa eugonadal: `EUGONADAL_MIN_NGDL`, `EUGONADAL_MAX_NGDL`
- Alvos da literatura: `ALVOS_CALIBRACAO`
- Parâmetros populacionais: `PARAMETROS_POPULACIONAIS`
- Variabilidade interindividual (CV): `IIV_CV`

### Funções de fluxo principal no motor PK

- `simularPerfil(...)`: gera curva temporal de concentração
- `calcularMetricas(...)`: extrai Cmax, Cmin, Cavg, tmax, meia-vida aparente, tempo para steady state
- `simularMonteCarlo(...)`: simulação populacional com variabilidade entre pacientes
- `gerarCronograma(...)`: doses em intervalo fixo
- `gerarCronogramaSchubert(...)`: regime 0, 6 semanas, depois 12/12 semanas
- `recomendarIntervalo(...)`: estima ajuste individual e recomenda intervalo com base em metas e medidas observadas

---

## 5) Fluxo do frontend (pk-simulator)

Arquivo de tela principal: `artifacts/pk-simulator/src/pages/simulator.tsx`.

Fluxo:

1. Usuário ajusta dose, intervalo, número de doses, unidade e Monte Carlo
2. UI gera cronograma (`gerarCronograma` ou `gerarCronogramaSchubert`)
3. UI executa simulação (`simularPerfil`) e calcula métricas (`calcularMetricas`)
4. Se habilitado, roda Monte Carlo (`simularMonteCarlo`)
5. Resultados são renderizados em gráficos (Recharts) e cards de indicadores clínicos
6. Aba de paciente permite inserir Cmax/Cmin e obter recomendação (`recomendarIntervalo`)

Arquivos de entrada:

- `src/main.tsx` inicia app React
- `src/App.tsx` define roteamento (`/` -> Simulator)

---

## 6) Fluxo da API e contrato

### API server (`artifacts/api-server`)

- `src/index.ts`: sobe servidor com `PORT` obrigatório
- `src/app.ts`: middlewares (pino-http, CORS, JSON/urlencoded), monta rotas em `/api`
- `src/routes/health.ts`: endpoint `GET /healthz` retornando `{ status: "ok" }` validado por Zod

### Contrato OpenAPI e geração

- `lib/api-spec/openapi.yaml`: fonte do contrato
- `lib/api-spec/orval.config.ts`: gera:
  - cliente React Query em `lib/api-client-react/src/generated`
  - tipos/schemas Zod em `lib/api-zod/src/generated`

### Cliente HTTP customizado

`lib/api-client-react/src/custom-fetch.ts`:

- permite `setBaseUrl(...)` e `setAuthTokenGetter(...)`
- aplica headers de forma consistente
- detecta/parseia respostas JSON/text/blob
- lança erros estruturados (`ApiError`, `ResponseParseError`)

---

## 7) Banco de dados (estado atual)

`lib/db` já está preparado com:

- `db` e `pool` exportados em `src/index.ts`
- validação de `DATABASE_URL` obrigatória
- configuração Drizzle em `drizzle.config.ts`

Atualmente não há tabelas de domínio publicadas em `src/schema/index.ts` (arquivo base/template).

---

## 8) Variáveis de ambiente importantes

- `PORT` (obrigatória em API server e Vite configs dos artifacts)
- `BASE_PATH` (obrigatória no frontend Vite do `pk-simulator`)
- `DATABASE_URL` (obrigatória para pacote `lib/db`)
- `NODE_ENV`, `LOG_LEVEL` (comportamento de logging no backend)

---

## 9) Comandos de referência

No workspace root:

- `pnpm run typecheck`
- `pnpm run build`

Por pacote:

- `pnpm --filter @workspace/api-spec run codegen`
- `pnpm --filter @workspace/api-server run dev`
- `pnpm --filter @workspace/pk-simulator run dev`

---

## 10) Resumo funcional

O coração do repositório é o **simulador PK**: ele transforma um esquema de injeções em curvas de concentração, métricas clínicas e análise de variabilidade populacional/individual. O restante do monorepo dá suporte a esse fluxo com API, contrato tipado, cliente gerado e base de dados preparada para expansão.
