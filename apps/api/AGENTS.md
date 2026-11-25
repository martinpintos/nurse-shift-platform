# AGENTS.md

Rules that apply to the whole repo (the contract in `docs/spec.md`, permissions, audit log, privacy, testing) are in the root `CLAUDE.md`. This file covers what is specific to the NestJS API.

## NestJS

This app's version of NestJS (12) is likely newer than what you know. https://docs.nestjs.com/llms.txt indexes its documentation, with a markdown page per chapter.

Nest's packages are ESM only, and this project is ESM too: relative imports end in `.js`, `__dirname` doesn't exist (use `import.meta.dirname`), and tests run on Vitest, so mocks are `vi.fn()`, not `jest.fn()`.

Validate requests with the zod schemas from `@repo/shared`, never with hand-written checks or new DTO classes: `StandardSchemaValidationPipe` with `@Body({ schema })` or `@Param('id', { schema })` (https://docs.nestjs.com/application/validation.md).

Nest has first-party packages for what this product needs, so check them before adding another library or writing your own:

- Sign-in: [`@nestjs/authentication`](https://docs.nestjs.com/security/authentication.md). Permissions: [`@nestjs/authorization`](https://docs.nestjs.com/security/authorization.md). Rate limiting: [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting.md).
- Configuration: [`@nestjs/config`](https://docs.nestjs.com/application/configuration.md).
- Email: [`@nestjs/mail`](https://docs.nestjs.com/application/mail.md). Transactional outbox: [`@nestjs/outbox`](https://docs.nestjs.com/reliability/outbox.md). Files, S3 included: [`@nestjs/storage`](https://docs.nestjs.com/application/file-storage.md).

## This project

### App

- `src/main.ts` creates the app, applies `configureApp` and listens on `PORT` (3001 by default; the web app uses 3000).
- `src/app.setup.ts` (`configureApp`) sets `helmet`, the global `/api` prefix, the global `StandardSchemaValidationPipe` and the `ErrorResponseFilter`, which turns every error into `{ "error": "<message>" }`. The e2e tests call it too, so never configure the app anywhere else.
- `src/app.module.ts` is the root module that imports the others; `AuthModule` comes first. `src/config/env.ts` validates the environment at boot (`DATABASE_URL`, `JWT_SECRET` of 32+ characters, `PORT`; see `.env.example`) and names bad keys without their values.
- `src/common/`: `ErrorResponseFilter` (it also maps the auth libraries' generic 401/403 bodies to `ERROR_MESSAGES`) and `Clock`, the injectable "now". Inject `Clock` wherever a decision depends on the time; tests override it.

### Auth and permissions (`src/auth/`)

- `@nestjs/authentication` with a global guard: every route needs `Authorization: Bearer <jwt>`. `JwtAuthProvider` maps verified claims (`sub`, `role`, `agencyId`) to a `Principal`; no database read per request. HS256 with `JWT_SECRET`, issuer `shiftpatch-api`, audience `shiftpatch-web`, 8h, no refresh tokens.
- `@nestjs/authorization` denies any handler without a check. Every handler declares exactly one `@Access("METHOD /api/path")`, which reads the route's access from `ROUTES` in `@repo/shared`: `@Public()` for login and health, otherwise `RolePolicy` (any other role gets 403). Ownership rules (own agency, own claim, own credential) live in the services. Get the caller with `@CurrentUser() principal: Principal`.
- `AuthService`: login (`PasswordHasher`, scrypt, emails stored lowercased) and `me`. `LoginThrottle`: failed attempts only, in memory, per account (normalized email): 10 in a 15-minute sliding window, from any IP. Don't key it on `req.ip`: behind Vercel and Railway the API sees a different proxy address on every request.

### Features

- `src/shifts/`: the spec's shift routes and `GET /api/agencies/:agencyId/shifts`. Every route that returns a shift builds it with `toShiftDto` (`shift.mapper.ts`), which reads `@db.Date` in UTC, never local time; lists sort with `compareShifts` (date, then numeric id). Claims and cancels are conditional `updateMany`s inside one transaction, so concurrent requests can't both win.
- `src/credentials/`: license uploads (multer in memory via `CredentialUploadInterceptor`, type from magic bytes in `file-type.ts`, bytes in Postgres), listing and download. TB test results are never stored (`ESCALATION.md`).
- `src/timesheets/`: submit (locks the shift row against a concurrent cancel), list, approve.
- `src/admin/`: dashboard feed, audit log, outbox, reset.
- `src/audit/audit.ts` (`recordAudit`) and `src/outbox/outbox.ts` (`queueOutbox` and the message templates) take the transaction client (`Tx`, `src/prisma/db.ts`) of the change they record: every state change writes its audit entry, and claims and cancels their outbox messages, in the same transaction. Audit details hold ids and enum values only.

### Database and seed

- Prisma 7 (no first-party Nest package). The schema is `prisma/schema.prisma` and the config `prisma.config.ts`. The client is generated into `src/generated/prisma` (gitignored; `pnpm exec prisma generate`) and injected as the global `PrismaService` (`@prisma/adapter-pg`). Import models and types from `../generated/prisma/client.js`.
- Agency and user ids are the spec's (`agency-a`, `nurse-1`); agency logins use the agency id as their user id. Shift ids come from the database (`'shift-' || nextval('shift_id_seq')`); migrations that touch `Shift.id` must keep that sequence. The other tables use uuid ids (TEXT). `AuditLog` and `OutboxMessage` have a `seq` column for a stable newest-first order.
- `prisma dev`'s shadow database is unreliable. To add a migration: `prisma migrate deploy`, then `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql`, then `prisma migrate deploy` again. `pnpm verify` checks for drift.
- `src/seed/`: `seedDatabase(prisma, "ensure" | "reset", then?)`. `ensure` only inserts missing rows; `reset` truncates every app table first; both move `shift_id_seq` to the highest shift number (at least 3) and run `then(tx)` in the same transaction. `src/seed/cli.ts` runs `ensure`: `pnpm --filter api build`, then `pnpm --filter api exec prisma db seed` (or `pnpm --filter api seed`).

### Tests

- Unit tests sit beside the code as `*.spec.ts`; e2e tests are in `test/` as `*.e2e-spec.ts`. `pnpm test` runs both Vitest projects (`unit`, `e2e`); `pnpm test:e2e` runs only e2e. e2e files run one at a time (`fileParallelism: false`) against `DATABASE_URL` and reset it with `seedDatabase(prisma, "reset")`.
- `test/helpers.ts` boots the real app (`createTestApp`, with a movable `TestClock`) and signs in through the API (`loginAll`). `test/contract.e2e-spec.ts` iterates `ROUTES`: 401s, 403 for every role not listed, and a success case per route parsed with its shared schema (typed by `RouteKey`, so a new route without a case fails type-check).
- Lint is oxlint with type-aware rules (`no-floating-promises` is an error).
