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

## Production

| What          | URL                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Web (Vercel)  | https://shiftpatch-dev.vercel.app/                                                                         |
| API (Railway) | https://api-production-de40f62a.up.railway.app (also reachable as `/api/*` on the web URL via the rewrite) |
| Health        | https://shiftpatch-dev.vercel.app/api/health                                                               |

Per-deployment Vercel URLs (`web-<hash>-….vercel.app`) sit behind Vercel Authentication. Use the production URL above for demos and checks.

## Deploy

Both deploy from `main` on push.

**Web (Vercel, project `web`).** Builds `apps/web` with the Next.js preset. Set `API_URL` to the API's public URL (`https://api-production-de40f62a.up.railway.app`) for **both build and runtime**: the `/api/*` rewrite in `next.config.js` reads it when the config loads.

**API (Railway, project `distinguished-motivation`, service `api`, environment `production`).** The service and its Postgres are defined in code in [`.railway/railway.ts`](.railway/railway.ts):

- Build: `pnpm turbo run build --filter=api` (Railpack, Node 24 from `.nvmrc`, pnpm from `packageManager`)
- Pre-deploy: `pnpm --filter api exec prisma migrate deploy`, so every deploy migrates before it serves
- Start: `pnpm --filter api start` (`node dist/main.js`)
- Healthcheck: `/api/health`. A deploy only goes live once it returns 200, which needs the database.
- Watch paths: `apps/api/**`, `packages/shared/**` and the root files that change the build (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `turbo.json`, `.nvmrc`). Pushes that touch nothing else don't redeploy the API.
- Variables stay in Railway, not in code (`variables: { managed: false }`): `DATABASE_URL` is the reference `${{Postgres.DATABASE_URL}}`, and Railway sets `PORT`.

To change Railway settings, edit `.railway/railway.ts`, then review and apply:

```bash
railway link --project distinguished-motivation --environment production --service api
railway config plan    # must show only the changes you intend
railway config apply
```

Applying a build or deploy change triggers a redeploy. Dashboard edits drift from the file; bring them back with `railway config pull` and commit.

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
- **Hosting: Vercel for the web, Railway for the API and Postgres.** Vercel runs Next.js natively. Railway runs the long-lived NestJS process next to a managed Postgres, with a pre-deploy migration step and a healthcheck that gates each release. The web rewrites `/api/*` to Railway, so the product has one public URL and the spec's `/api/*` routes work on it.
- **Railway start command is `pnpm --filter api start`.** The first deploy failed with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`: it ran `start:prod`, the Nest template's script name, which the scaffold had replaced with `start` (`node dist/main.js`).
- **Railway settings live in `.railway/railway.ts`, not `railway.json`.** Railway deprecated `railway.json`/`railway.toml`: services without one can't opt in, and existing files stop being read on 2026-12-01. The file was imported with `railway config pull` (the plan showed no changes), and variables are left unmanaged, so no secret or connection string is in source. The import also widened the watch paths to the root files that change the API build. Before, a catalog bump or a security override in `pnpm-workspace.yaml` would not have redeployed the API.
