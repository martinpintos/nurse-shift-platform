# ShiftPatch

Shift marketplace for healthcare staffing. Agencies post open nursing shifts, nurses with valid credentials claim them, and an admin watches coverage live. Fictional, neutral brand.

- [`docs/spec.md`](docs/spec.md): the exact API contract and required test IDs
- [`docs/brief.md`](docs/brief.md): product brief and committed scope
- [`ESCALATION.md`](ESCALATION.md): open decision on TB test results
- [`CLAUDE.md`](CLAUDE.md): how we work on this repo

## Layout

pnpm workspaces + Turborepo, TypeScript everywhere.

| Path                        | What                                                    |
| --------------------------- | ------------------------------------------------------- |
| `apps/web`                  | Next.js App Router, all UI                              |
| `packages/eslint-config`    | Shared ESLint config                                    |
| `packages/typescript-config`| Shared `tsconfig` bases                                 |

## Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm, the version pinned in `package.json` `packageManager`

## Commands

```bash
pnpm install
pnpm dev
```

## Decisions

Product and engineering decisions, recorded as they are made.

- **Neutral branding.** The starter template's Turborepo and Vercel logos, links and favicon were removed, per the brief's "no real company names or assets" constraint.
