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

- `src/main.ts` creates the app, applies `configureApp` and listens on `PORT` (3001 by default; the web app uses 3000).
- `src/app.setup.ts` (`configureApp`) sets the global `/api` prefix and the `ErrorResponseFilter`, which turns every error into `{ "error": "<message>" }`. The e2e tests call it too, so never configure the app anywhere else.
- `src/app.module.ts` is the root module that imports the others. `src/config/env.ts` validates the environment at boot (see `.env.example`).
- Database: Prisma 7 (no first-party Nest package). The schema is `prisma/schema.prisma` and the config `prisma.config.ts`. The client is generated into `src/generated/prisma` (gitignored; `pnpm exec prisma generate`) and injected as the global `PrismaService` (`@prisma/adapter-pg`). Import models and types from `../generated/prisma/client.js`.
- Ids are plain strings: agencies and users only come from the seed with the spec's ids, and shift ids come from the database (`'shift-' || nextval('shift_id_seq')`). Migrations that touch `Shift.id` must keep that sequence.
- Every route that returns a shift builds it with `toShiftDto` (`src/shifts/shift.mapper.ts`). It reads `@db.Date` in UTC, never local time.
- `GET /api/health` is public by design. Every other route except login requires a token.
- Unit tests sit beside the code as `*.spec.ts`; e2e tests are in `test/` as `*.e2e-spec.ts`. `pnpm test` runs both Vitest projects (`unit`, `e2e`); `pnpm test:e2e` runs only e2e.
- Lint is oxlint with type-aware rules (`no-floating-promises` is an error).
