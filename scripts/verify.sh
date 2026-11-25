#!/usr/bin/env bash
# Full local check, the same gates CI enforces. Usage: pnpm verify [e2e]
# Needs apps/api/.env (DATABASE_URL, JWT_SECRET) pointing at a local Postgres.
set -uo pipefail

cd "$(dirname "$0")/.."

failures=()

step() {
  local name="$1"
  shift
  echo
  echo "==> ${name}"
  if "$@"; then
    echo "--> ${name}: ok"
  else
    echo "--> ${name}: FAILED"
    failures+=("${name}")
  fi
}

# Load the API's local env (gitignored) so tests and the drift check see the
# database and JWT secret. Values are exported, never printed.
if [[ -f apps/api/.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source apps/api/.env
  set +a
fi

step "install (frozen lockfile)" pnpm install --frozen-lockfile --silent
step "format" pnpm exec prettier --check . --log-level warn
step "dependency audit" pnpm audit --prod --audit-level high
# Migrations first: the API's e2e tests need the current schema, as in CI.
step "migrations applied locally" pnpm --filter api exec prisma migrate deploy
step "check-types lint test build" pnpm turbo run check-types lint test build --ui=stream --output-logs=errors-only
step "schema drift" pnpm --filter api exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code

if [[ "${1:-}" == "e2e" ]]; then
  step "end-to-end (Playwright)" pnpm e2e
fi

echo
if ((${#failures[@]})); then
  echo "verify: FAILED (${failures[*]})"
  exit 1
fi
echo "verify: all checks passed"
