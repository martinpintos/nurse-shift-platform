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
- **TypeScript 6.0.3 everywhere, not 7.** TypeScript 7 (the native port) has no JS compiler API yet. The Nest CLI build, tsup's `.d.ts` output and typescript-eslint all need it (typescript-eslint supports `<6.1`). One version is pinned in the pnpm `catalog:` in `pnpm-workspace.yaml`.
- **Shared tool versions live in the pnpm catalog.** That covers TypeScript, `@types/node`, zod, Vitest and Prisma. Prisma is pinned to exactly 7.10.1 because npm's `latest` tag for `prisma` points to an 8.0 release candidate, while `@prisma/client` is on 7.10.1.
- **ESLint uses typescript-eslint, not the template's Babel parser.** The turbo template's flat config only matched `.js` files, so `lint` passed without checking any TypeScript. typescript-eslint's recommended config lints `.ts`/`.tsx` with real type-aware scope.
- **Dependency build scripts are opt-in** (`allowBuilds` in `pnpm-workspace.yaml`). pnpm 11 fails the install on any unlisted build script. Each entry is an explicit allow or deny with a reason.
- **The contract lives in `@repo/shared`** and its tests read `docs/spec.md` directly: every JSON example, the error messages, login roles and the 15 test IDs. A spec change fails the tests instead of drifting.
  - Response schemas are strict (an extra or missing field fails). Request schemas strip unknown keys, so a body `agencyId` is ignored and the agency comes from the token.
  - The `GET /api/agencies/:agencyId/shifts` examples are abbreviated in the spec, which says "same shape as above". The response returns full shifts; the test checks those two examples only for the fields they show.
  - Shift roles are `RN` and `LPN`, the two the spec uses. Overnight shifts (end before start) and past dates are valid.
  - Login validation is permissive: any body that doesn't match a user gets the same 401, so validation never reveals which field was wrong.
- **NestJS 12, ESM, Vitest**, generated with `--no-observe --skip-skills`. Without a TTY, Nest CLI 12 otherwise enables NestJS Observe, a third-party telemetry SDK, and installs agent skills. The brief allows only PostHog, with ids and event names only. The generated AGENTS.md was trimmed to what this API uses. The vendor deploy script (`nest deploy`, `@nestjs/mau`) was dropped too.
- **Two linters, each where its generator put it.** The API keeps Nest's type-aware oxlint, which catches floating promises. Web and shared use `@repo/eslint-config`.
- **Every error is `{ "error": "<message>" }`**, including unknown routes and paths outside `/api`. Unexpected errors return a generic 500 `Internal server error` and are logged server-side, never echoed.
- **Ports:** web on 3000, API on 3001.
