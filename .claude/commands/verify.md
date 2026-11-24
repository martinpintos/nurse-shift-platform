---
description: Run the full check (install, format, audit, types, lint, tests, build, schema drift; optionally e2e) before committing
argument-hint: "[e2e]"
allowed-tools: Bash(pnpm verify:*), Bash(bash scripts/verify.sh:*)
---

Run the repository's full verification and report the result. Use it before every commit.

1. Run `pnpm verify $ARGUMENTS` from the repository root. It runs, in order:
   - `pnpm install --frozen-lockfile`
   - `prettier --check .`
   - `pnpm audit --prod --audit-level high`
   - `turbo run check-types lint test build`
   - `prisma migrate deploy` on the local database, then a schema drift check
   - with `e2e`, the Playwright suite (`pnpm e2e`)
2. It needs `apps/api/.env` with `DATABASE_URL` and `JWT_SECRET` for a local Postgres. If that file is missing, say so and stop; never print its values.
3. Report one line per step (ok or FAILED). For each failure, quote the relevant error lines and name the file and line.
4. Do not fix anything, reformat or commit as part of this command. If something failed, say what you would change and wait. The commit happens only after a fully green run.
