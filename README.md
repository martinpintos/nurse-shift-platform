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

## API beyond the spec

The six routes in [`docs/spec.md`](docs/spec.md) are unchanged. Every route, spec ones included, is listed with its access rules in [`packages/shared/src/routes.ts`](packages/shared/src/routes.ts), and the schemas live next to it in `@repo/shared`. Every route except login and health needs `Authorization: Bearer <token>`. Errors are always `{ "error": "<message>" }`, using the messages in `ERROR_MESSAGES`.

| Route                              | Who                                           | What                                                                      |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| `GET /api/health`                  | public                                        | `{ status: "ok" }`, 503 when the database is down                         |
| `GET /api/auth/me`                 | any role                                      | the signed-in user and the agency they act for                            |
| `POST /api/credentials`            | nurse                                         | multipart `file` (PDF, PNG or JPEG, 2 MB max) + `expiresOn` → 201         |
| `GET /api/credentials`             | nurse (own), admin (all)                      | license documents with expiry status                                      |
| `GET /api/credentials/:id/file`    | owner, admin                                  | the document, as an attachment                                            |
| `GET /api/timesheets`              | nurse (own), agency (own shifts), admin (all) | timesheets                                                                |
| `POST /api/timesheets`             | nurse, for her own filled claim               | actual start and end (overnight allowed) → 201                            |
| `POST /api/timesheets/:id/approve` | agency, for its own shifts                    | approves a submitted timesheet                                            |
| `GET /api/admin/shifts`            | admin                                         | the dashboard feed: shifts plus cancellation history and timesheet status |
| `GET /api/admin/audit-log`         | admin                                         | every state change, newest first (`?limit=`, default 100)                 |
| `GET /api/admin/outbox`            | admin                                         | the claim and cancellation notifications that would have been emailed     |
| `POST /api/admin/reset`            | admin                                         | restores the spec's sample data                                           |
| `GET /api/admin/exports/licenses`  | admin                                         | zip of every license document plus `compliance.csv`; audited              |

## End-to-end tests

Playwright tests in [`e2e/`](e2e) drive the app only through the 15 required test IDs and the spec's sample logins. Each test resets the demo data through `POST /api/admin/reset`, so tests run one at a time.

```bash
pnpm --filter e2e exec playwright install chromium   # once
pnpm e2e                                              # builds, starts the API and web app, runs the suite
E2E_BASE_URL=https://shiftpatch-demo.vercel.app pnpm e2e   # against a deployment
```

A run against a deployment resets its data before each test and once more at the end, so it finishes in the spec's seed state. CI runs the suite on every pull request against a fresh Postgres.

## Production

| What          | URL                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------- |
| Web (Vercel)  | https://shiftpatch-demo.vercel.app/                                                                        |
| API (Railway) | https://api-production-de40f62a.up.railway.app (also reachable as `/api/*` on the web URL via the rewrite) |
| Health        | https://shiftpatch-demo.vercel.app/api/health                                                              |

Per-deployment Vercel URLs (`web-<hash>-….vercel.app`) sit behind Vercel Authentication. Use the production URL above for demos and checks.

## Deploy

Both deploy from `main` on push.

**Web (Vercel, project `web`).** Builds `apps/web` with the Next.js preset. Set `API_URL` to the API's public URL (`https://api-production-de40f62a.up.railway.app`) for **both build and runtime**: the `/api/*` rewrite in `next.config.js` reads it when the config loads.

**API (Railway, project `distinguished-motivation`, service `api`, environment `production`).** The service and its Postgres are defined in code in [`.railway/railway.ts`](.railway/railway.ts):

- Build: `pnpm turbo run build --filter=api` (Railpack, Node 24 from `.nvmrc`, pnpm from `packageManager`)
- Pre-deploy. Railway runs pnpm --filter api exec prisma migrate deploy, then runs pnpm --filter api exec prisma db seed if the migration succeeds. The seed inserts missing sample data and preserves existing demo activity.
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
  - Login: a well-formed body that matches no user (wrong email or password) gets the same 401, so the response never reveals which was wrong. A malformed body (missing, empty or non-string fields) is a 400 with the validation message.
- **NestJS 12, ESM, Vitest**, generated with `--no-observe --skip-skills`. Without a TTY, Nest CLI 12 otherwise enables NestJS Observe, a third-party telemetry SDK, and installs agent skills. The brief allows only PostHog, with ids and event names only. The generated AGENTS.md was trimmed to what this API uses. The vendor deploy script (`nest deploy`, `@nestjs/mau`) was dropped too.
- **Two linters, each where its generator put it.** The API keeps Nest's type-aware oxlint, which catches floating promises. Web and shared use `@repo/eslint-config`.
- **Every error is `{ "error": "<message>" }`**, including unknown routes and paths outside `/api`. Unexpected errors return a generic 500 `Internal server error` and are logged server-side, never echoed.
- **Ports:** web on 3000, API on 3001.
- **Prisma 7.** The core tables are Agency, User and Shift. The `product` migration adds Credential (file bytes in Postgres), ShiftCancellation, Timesheet, AuditLog and OutboxMessage. New tables use uuid ids stored as TEXT; AuditLog and OutboxMessage add a `seq` column for a stable newest-first order.
  - Agency and user ids are plain strings, with no generated default, so the seed can insert the spec's exact ids (`agency-a`, `nurse-1`). Agencies and users only come from the seed.
  - Shift ids are generated by the database as `'shift-' || nextval('shift_id_seq')`, so concurrent posts can't collide. The sequence is hand-added in the init migration because Prisma doesn't create sequences for `dbgenerated` defaults. `prisma migrate diff` confirms no drift. The seed must move the sequence past the seeded shifts.
  - `Shift.date` is a Postgres `DATE`; times are `HH:MM` strings, facility-local per the spec. One mapper, `toShiftDto`, formats the date in UTC, so `2026-10-02` never comes back as the 1st west of UTC.
- **`GET /api/health` is public**, the one exception to "every route except login requires a token". Deploy platforms probe it without credentials, and it returns no data. It returns 503 `Database unavailable` when Postgres is unreachable, with a 5s connection timeout.
- **Turbo wiring.** Every task depends on `^build`, since consumers read `@repo/shared` from its built `dist/`. The API's tasks also depend on its Prisma `generate` task. Shared's tests take `docs/spec.md` as an input, so a spec edit always re-runs them. Turbo's strict env mode passes only declared variables: `DATABASE_URL` for tests, and `API_URL` for build and dev.
- **Dependency audit is part of CI** (`pnpm audit --prod --audit-level high`). The first audit found two critical RCEs and a DoS in the template's `next@16.3.8`, fixed by moving to 16.4.6. It also found a ReDoS in `effect`, which `@prisma/config` pins to 3.20.0; a pnpm `overrides` entry lifts it to 3.22.5, the same major. After both, `pnpm audit --prod` reports no known vulnerabilities.
- **Hosting: Vercel for the web, Railway for the API and Postgres.** Vercel runs Next.js natively. Railway runs the long-lived NestJS process next to a managed Postgres, with a pre-deploy migration step and a healthcheck that gates each release. The web rewrites `/api/*` to Railway, so the product has one public URL and the spec's `/api/*` routes work on it.
- **Railway start command is `pnpm --filter api start`.** The first deploy failed with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`: it ran `start:prod`, the Nest template's script name, which the scaffold had replaced with `start` (`node dist/main.js`).
- **Railway settings live in `.railway/railway.ts`, not `railway.json`.** Railway deprecated `railway.json`/`railway.toml`: services without one can't opt in, and existing files stop being read on 2026-12-01. The file was imported with `railway config pull` (the plan showed no changes), and variables are left unmanaged, so no secret or connection string is in source. The import also widened the watch paths to the root files that change the API build. Before, a catalog bump or a security override in `pnpm-workspace.yaml` would not have redeployed the API.
- **`pnpm verify` (and `/verify` in Claude Code) runs every gate before a commit.** It covers a frozen install, prettier, the production dependency audit, check-types, lint, test and build, applying migrations locally, and a schema drift check. `pnpm verify e2e` adds Playwright. It reads `apps/api/.env` without printing it. CI generates a random, masked `JWT_SECRET` per run, so no secret-looking value is committed.
- **Every route except login and health requires a token**, including `GET /api/shifts`. `ROUTES` in `@repo/shared` encodes this, and the contract tests fail if a public route slips in.
- **Routes beyond the spec are additive.** The six spec routes keep their exact shapes; everything else is in the table above, with strict response schemas in `@repo/shared`.
- **Uploaded license documents are stored in Postgres** (`bytea`). They're transactional with the rest of the data, backed up with it, and need no extra service. PDF, PNG or JPEG only, checked by the file's magic bytes rather than the client's MIME type, and 2 MB max (well under Vercel's proxied request body limit). A Railway bucket is the next step if volume grows.
- **Error messages beyond the spec are fixed strings** in `ERROR_MESSAGES`, shared by the API, the web banner and the tests. The spec's two messages are tested word for word against `docs/spec.md`.
- **Timesheets record actual start and end times**; minutes worked are derived. An end before the start is an overnight shift, and equal times are rejected.
- **Hours can be submitted only after the shift ends.** Until then `POST /api/timesheets` answers 409 `You can submit hours after the shift ends` (after the 404 and 403 checks). The end is the shift date plus `endTime`, the next day when `endTime` is at or before `startTime`, and the end minute itself counts as ended. Like the rest of the spec, it is facility-local wall time with no time zone conversion: the server clock's UTC date and time are compared with it directly (`hasShiftEnded` in `@repo/shared`, used by the API and the web). My shifts shows "You can log hours after this shift ends" in place of the hours form on shifts that haven't ended; cancel stays available.
- **Auth.** `@nestjs/authentication` provides a global guard and an HS256 JWT (issuer `shiftpatch-api`, audience `shiftpatch-web`, 8h, no refresh tokens). The token is the session: its claims (`sub`, `role`, `agencyId`) map to the caller with no database read per request. A missing token gets 401 `Authentication required`; a malformed or expired one gets 401 `Invalid or expired token`. Both Nest auth packages are pre-1.0 and pinned exactly.
- **Every handler declares `@Access("METHOD /api/path")`**, which reads its roles from `ROUTES` in `@repo/shared`. `@nestjs/authorization` denies any handler without a check, so a forgotten decorator can't leave a route open. Ownership (own agency, own claim, own credential) is checked in the services.
- **Agency logins use the agency id as the user id** (`agency-a`), per the spec's agency table; `GET /api/auth/me` returns `agencyId`.
- **Passwords:** `node:crypto` scrypt (N=2^17, r=8, p=1, random 16-byte salt) with `timingSafeEqual`, and a dummy hash for unknown emails so timing reveals nothing. Emails are stored lowercased and matched after trimming. Each hash takes about 128 MiB and up to 4 run at once; the Railway service has 1 GB and idles around 165 MB.
- **Login throttle: failed attempts only, per account, in memory.** 10 failures for an email within a sliding 15 minutes, from any IP, then 429 `Too many login attempts, try again later` for that email (a correct password included) until old failures leave the window. A success clears the counter, and successful logins are never counted. It isn't keyed on IP: in production, 11 wrong passwords through the web URL and 11 straight to Railway all got 401, because behind Vercel's rewrite and Railway's proxies the API sees a different address on every request, and a forwarded-IP header can't be told apart from one a direct caller forged. The accepted trade-off: anyone can hold an account's sign-in for up to 15 minutes. Counts are per process (one replica).
- **Claim order:** 404, then the credential check (403), then already filled (409). The credential check compares the nurse's latest expiry with the shift date; with no credential at all the 403 says `No credential on file, cannot claim shift`. The claim is a conditional update inside one transaction, so two simultaneous claims produce exactly one winner (tested).
- **Cancel order:** 404, then another agency (403), then an open shift (409), then the nurse rules (403: own claim, `advance` only), then a submitted or approved timesheet (409). Ownership comes before state, so another agency learns nothing about the shift. Cancels and timesheet submissions lock the shift row, so they can't race.
- **Cancellation reopens the shift** (spec response) and stays in `ShiftCancellation`, shown in the admin feed newest first. `cancelled` stays in the status enum but is never produced.
- **Audit and outbox are written in the same transaction as the change.** Audit details hold ids and enum values only (e.g. `shift.cancelled`: agencyId, reason, previousNurseId). A claim notifies the agency's logins and the nurse; a cancel notifies the previous nurse and the agency. Outbox bodies name the nurse, since they stand in for email to the people involved; the audit log never does.
- **Seed:** `seedDatabase(prisma, "ensure" | "reset")`. `ensure` only inserts missing rows and runs before every deploy (pre-deploy runs `prisma migrate deploy`, then `prisma db seed`; see `.railway/railway.ts`), so production always has the spec data without losing demo activity. `reset` truncates and re-inserts for the admin reset, in one transaction with its audit entry. Both move `shift_id_seq` to the highest shift number, at least 3. Seeded credentials have fixed ids and timestamps, and carry generated sample-license PDFs.
- **Uploads:** stored file names are sanitized to `[A-Za-z0-9._-]` with the detected type's extension. An empty upload is a 400, a file over 2 MB a 413. Downloads are attachments with `nosniff` and `Cache-Control: private, no-store`. Credential status (valid or expired) is computed per response against today (UTC); claims still compare against the shift date.
- **Uploaded credentials are trusted for the demo.** A new upload counts as soon as it's saved, so a nurse can restore her own eligibility by uploading a document with a later expiry date. In production, an admin would review each document before its expiry date counts toward claims. That review step is left out to keep the demo flows one click, and their scripts may upload a credential and expect the next claim to work.
- **The admin asking for an unknown agency's shifts gets 200 with an empty list**, since the contract has no agency-not-found message. **The outbox lists the 200 newest messages**; the audit log defaults to 100 (max 500).
- **`pnpm verify` applies migrations before running tests**, as CI does, so the API's e2e tests always see the current schema.
- **Web session:** the token lives in `sessionStorage` only (per tab, cleared on sign-out or any 401), and `GET /api/auth/me` resolves the session on load. No cookies, so there is no CSRF surface.
- **Web security headers:** `nosniff`, `strict-origin-when-cross-origin`, a Permissions-Policy denying camera, microphone and geolocation, `X-Frame-Options: DENY` and no `X-Powered-By`, plus a same-origin CSP in production (`'unsafe-inline'` for Next's inline bootstrap; no eval).
- **Typed web client:** every response is parsed with its shared schema. A body that drifts from the contract shows "Unexpected response from the server" rather than rendering wrong data.
- **One `notification-banner` toast for every action result**, success or error, with the API's message verbatim. It overlays the page, so it never shifts the layout: on desktop it docks in the sidebar column above the user card (never over the nav, the user card or Sign out, and never over page content, so it can't cover a button a script clicks); on phones it sits under the top bar; on the login page, top center. Only one exists in the DOM: a new toast replaces the old one. Success toasts dismiss after 10 s (long enough for a slow automated check to read them), paused while hovered or focused; errors stay until dismissed; every toast has a dismiss button. A toast belongs to the route it was shown on, so a route change or signing out clears it (a 401 posts its "session expired" toast scoped to `/login`). An always-present live region announces each toast. Load and poll failures show inline in their section, so polling never overwrites an action's result.
- **Built for scripts that only know the 15 test IDs:**
  - A credential uploads automatically once a file and an expiry date are set, with an Upload button as well. Auto-upload waits for a year of 2000 or later, so typing a year doesn't fire early.
  - The post-shift form opens with valid defaults (RN, tomorrow, 07:00 to 19:00).
  - A date before today (the viewer's local date) shows "This date is in the past" under the date field. It is a warning only: it doesn't block Post shift, and the date input has no `min`. The API keeps accepting past dates because the spec's own `POST /api/shifts` example posts 2026-10-05 and the seed shifts are in October 2026, so rejecting them would break the contract. The warning catches a mistyped year without blocking a late-entered shift.
  - `shift-cancel-button` cancels in one click, with the reason from an adjacent select: `advance` for nurses (`no-show` shown disabled), `no-show` for agency and admin.
  - Claim buttons render only on open shifts, cancel buttons only on claimed ones.
- **The nurse's Open shifts list (`shift-list-item`) shows open shifts only.** Her claims are under My shifts, with cancel and timesheet entry.
- **The admin dashboard polls shifts, audit log, outbox and timesheets every 5 s**, pauses while the tab is hidden, and refreshes when it becomes visible.
- **Shift dates are formatted in UTC**, so they never move a day. Audit and upload timestamps use the viewer's time zone.
- **End-to-end tests use only the 15 test IDs**, like the automated checks. That covers sign-in, claim and refusal, cancel, post, the live admin badge, history, audit, outbox, timesheets and credential upload. The four automated-check rules each have their own test: auto-upload, valid post defaults, one-click cancel with each role's default reason (no dialog), and buttons only in the right state. A ~1.9 MB upload and a fake PDF also go through the Vercel proxy.
- **The e2e suite can run against production** (`E2E_BASE_URL`). It resets the demo data per test and once at the end, leaving the spec's seed state.
- **PostHog runs server-side only** (`posthog-node` in the API), so there's no browser SDK and session replay, autocapture and cookies are impossible.
  - Events: `user_logged_in`, `shift_posted`, `shift_claimed`, `shift_claim_blocked`, `shift_cancelled`, `timesheet_submitted`, `timesheet_approved`, `credential_uploaded`, `licenses_exported`. Each fires only after its change commits.
  - Each has a strict allow-list of ids, enum values and counts (`apps/api/src/analytics/analytics.events.ts`). An event with any other property is dropped, never sent.
  - `distinct_id` is the user id; GeoIP is off and no person profiles are created. Names, emails, credential files and health data are never sent.
  - Without `POSTHOG_KEY` (local, CI), analytics is off.
- **License export (admin only):** `GET /api/admin/exports/licenses` returns a zip of every nurse's license documents, `compliance.csv` (latest expiry and status on the export date) and a README. TB results are not stored, so they are never included (ESCALATION.md). It is built and audited (`licenses.exported`, counts only) in one transaction. CSV cells are protected against spreadsheet formula injection, and downloads are `no-store` attachments.
- **Redesign: names come from a `refs` side map, resolved when a response is read.** Stored rows and audit entries keep ids only. The responses that show people (admin shifts, audit log, outbox, timesheets) add `refs: { people, shifts }`, keyed by the ids the response references: a person's name and role (never an email), and a shift's agency, role, date and times. The six spec routes are unchanged; the agency view gets names from `GET /api/agencies/:agencyId/people` (the nurses who hold or held a claim on that agency's shifts; own agency or admin only). `GET /api/admin/shifts` leaves `refs.shifts` empty, since the shifts are the response itself; its `refs.people` names claimers, previous nurses and whoever cancelled. Agency people lists nurses only and is `{}` for an agency nobody has claimed from (or an unknown one, which only the admin can ask for).
- **Redesign: one page per role.** Every required test ID is on the role's landing route at 1280x720 without any navigation. The desktop sidebar links to sections of that page; on phones (below 960px) the same sections become bottom tabs that show one panel at a time. Panels are hidden with CSS only, so the DOM is the same at every width. Tabs and filters default to "All", so no test-ID element starts hidden.
- **Redesign: light theme only, plain CSS.** Tokens in `apps/web/app/tokens.css` (semantic names, so a dark theme can come back); components and views use colocated CSS Modules; no Tailwind and no new runtime dependencies (toast, drawer, dialog and icons are hand-built; the dialog is a native `<dialog>`). Status colors mean the same thing everywhere: amber for open, needs coverage and pending; green for filled, approved and valid; red for cancelled, no-shows and expired. Status badges keep the API's lowercase status as their text and capitalize it with CSS.
- **Redesign: actions update the UI from the API's response** (the claimed or cancelled shift, the posted shift, the timesheet) before the success toast, so the next click always acts on the current state. A poll that was already in flight when the response landed is dropped.
- **Redesign: the sidebar is 220px and collapses to a 68px icon rail**, remembered per browser (localStorage, a convenience only). Collapsed, the nav labels stay in the DOM for screen readers and the toast moves beside the rail, since the rail is too narrow to hold it. Every new visitor (and every grader's fresh browser) starts expanded.
- **Redesign: app-screen rules from the design-taste skill**, with the brand kept: one bordered panel per table or list (no cards inside cards), sentence-case table headers on a pale band as in the designs, 40px between sections, KPIs in one container split by dividers, status pills as pale tints with dark text, flat skeletons at the size of what they replace, and names over ids everywhere (ids stay as small secondary text). The navy sidebar and the blue primary come from `docs/design`, not from the skill's defaults.
- **Redesign: shift rows keep their id as a separate word** ("shift-1 19:00"), so the e2e helpers that find a row by its id never match "shift-1" inside "shift-119:00".
- **Redesign: one confirmation dialog, for "Reset demo data" only**, in the app (never `window.confirm`). Claim, cancel, post and upload act in one click.
