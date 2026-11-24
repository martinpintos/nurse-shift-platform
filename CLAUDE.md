# ShiftPatch

Shift marketplace for healthcare staffing. Agencies post open nursing shifts, nurses claim them, an admin monitors coverage live. Fictional, neutral brand.

## Source of truth

- `docs/spec.md` is the API contract. Routes, request and response shapes, status codes, error messages and test IDs must match it exactly. Never "improve" the contract.
- Every error response is `{ "error": "<message>" }`.
- Seed data must match the spec exactly and the seed must be idempotent.

## Stack and layout

pnpm workspaces + Turborepo, TypeScript everywhere. Before changing Turborepo config, follow `AGENTS.md` (read the docs bundled with the installed turbo version).

- `apps/web` Next.js App Router. All UI. `/api/*` is rewritten to the API so the app and API share one URL.
- `apps/api` NestJS, global prefix `/api`, Prisma + Postgres.
- `packages/shared` zod schemas and types for the contract, used by the API, the web app and the tests.
- `e2e/` Playwright, driven only by the required `data-testid`s.

## Commands

- `pnpm dev` run everything
- `pnpm turbo run check-types lint test` the verification loop
- `pnpm --filter api exec prisma migrate dev` migrations
- `pnpm --filter api exec prisma db seed` seed
- `pnpm e2e` Playwright

## Rules

- Permissions are enforced in the API, never only in the UI. Every route except login requires a token.
- Agencies only touch their own shifts. Shift `agencyId` always comes from the token, never the body.
- Claim checks credential expiry against the shift date. Do not reject past dates (seed shifts are in the past).
- Every state change (claim, cancel, post, approve, export) writes an audit log entry.
- PostHog events carry ids and event names only. No names, emails, credentials or health data. No session replay.
- Never commit secrets. Config comes from env, documented in `.env.example`.
- TB test documents are not stored. See `ESCALATION.md`.

## How we work

1. Plan before generating. For anything bigger than a small fix, write the plan first and wait for approval.
2. Independent work runs in parallel (separate agents or worktrees for API and web).
3. Done means the verification loop is green, not "it looks right". Add or update a test with every behavior change, including the failure cases (403, 409, 401).
4. Record product decisions and assumptions in the README "Decisions" section as they are made.
5. Small commits with clear messages.
