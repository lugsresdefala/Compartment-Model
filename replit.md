# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- `artifacts/pk-simulator` — **L.O.D.I.** (Lógica da Dose Individualizada para Hormonização). Educational PK simulator for testosterone undecanoate (Nebido). Dark-first futuristic neon theme (cyan/violet/magenta), Orbitron display font, HUD-styled `LodiLogo` component. Optional light theme keeps the same brand palette (lavender/pearl background, same cyan/violet/magenta accents); user choice is persisted in `localStorage` under key `lodi-theme` and applied pre-hydration by an inline script in `index.html` to avoid FOUC. Scientific engine in `src/lib/pk-engine.ts` is the source of truth and must not be modified for visual changes.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
