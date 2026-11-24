# ShiftPatch

Shift marketplace for healthcare staffing. Agencies post open nursing shifts, nurses with valid credentials claim them, and an admin watches coverage live. Fictional, neutral brand.

- [`docs/spec.md`](docs/spec.md): the exact API contract and required test IDs
- [`docs/brief.md`](docs/brief.md): product brief and committed scope
- [`ESCALATION.md`](ESCALATION.md): open decision on TB test results
- [`CLAUDE.md`](CLAUDE.md): how we work on this repo

## Layout

pnpm workspaces + Turborepo, TypeScript everywhere.

| Path                         | What                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `apps/web`                   | Next.js App Router, all UI. Proxies `/api/*` to the API, so both share one URL. |
| `apps/api`                   | NestJS 12 under `/api`, Prisma 7 + Postgres                                     |
| `packages/shared`            | `@repo/shared`: zod schemas, types and test IDs for the contract                |
| `packages/eslint-config`     | Shared ESLint config (typescript-eslint)                                        |
| `packages/typescript-config` | Shared `tsconfig` bases                                                         |

## Prerequisites

- Node.js 24 (`.nvmrc`)
- pnpm, the version pinned in `package.json` `packageManager`
- Postgres 17, or Prisma's local server: `pnpm --filter api exec prisma dev`

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL
cp apps/web/.env.example apps/web/.env.local
pnpm --filter api exec prisma migrate deploy
pnpm dev                                  # web on :3000, API on :3001
```

## Verification loop

```bash
pnpm turbo run check-types lint test
```

API tests include e2e tests against a real database, so `DATABASE_URL` must be set (from `apps/api/.env`, or exported). CI runs the same loop plus `build`, against a Postgres 17 service, and scans the full git history with gitleaks.

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
- **Prisma 7 with core tables only** (Agency, User, Shift); the seed, credentials, audit log and auth come next.
  - Agency and user ids are plain strings, with no generated default, so the seed can insert the spec's exact ids (`agency-a`, `nurse-1`). Agencies and users only come from the seed.
  - Shift ids are generated by the database as `'shift-' || nextval('shift_id_seq')`, so concurrent posts can't collide. The sequence is hand-added in the init migration because Prisma doesn't create sequences for `dbgenerated` defaults. `prisma migrate diff` confirms no drift. The seed must move the sequence past the seeded shifts.
  - `Shift.date` is a Postgres `DATE`; times are `HH:MM` strings, facility-local per the spec. One mapper, `toShiftDto`, formats the date in UTC, so `2026-10-02` never comes back as the 1st west of UTC.
- **`GET /api/health` is public**, the one exception to "every route except login requires a token". Deploy platforms probe it without credentials, and it returns no data. It returns 503 `Database unavailable` when Postgres is unreachable, with a 5s connection timeout.
- **Turbo wiring.** Every task depends on `^build`, since consumers read `@repo/shared` from its built `dist/`. The API's tasks also depend on its Prisma `generate` task. Shared's tests take `docs/spec.md` as an input, so a spec edit always re-runs them. Turbo's strict env mode passes only declared variables: `DATABASE_URL` for tests, and `API_URL` for build and dev.
- **Dependency audit is part of CI** (`pnpm audit --prod --audit-level high`). The first audit found two critical RCEs and a DoS in the template's `next@16.3.8`, fixed by moving to 16.4.6. It also found a ReDoS in `effect`, which `@prisma/config` pins to 3.20.0; a pnpm `overrides` entry lifts it to 3.22.5, the same major. After both, `pnpm audit --prod` reports no known vulnerabilities.
