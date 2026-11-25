import {
  defineRailway,
  github,
  postgres,
  project,
  service,
  volume,
} from "railway/iac";

export default defineRailway(() => {
  const Postgres = postgres("Postgres", { region: "iad" });
  Postgres.deploy = { multiRegionConfig: { iad: { numReplicas: 1 } } };
  Postgres.networking = { privateNetworkEndpoint: "postgres" };
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "iad",
    sizeMB: 500,
  });
  const api = service("api", {
    source: github("martinpintos/nurse-shift-platform", {
      branch: "main",
      checkSuites: false,
    }),
    build: {
      buildCommand: "pnpm turbo run build --filter=api",
      buildEnvironment: "V3",
      builder: "RAILPACK",
      watchPatterns: [
        "/apps/api/**",
        "/packages/shared/**",
        // Root files that change the API build: lockfile, version catalog and
        // security overrides, workspace scripts, turbo task graph, Node version.
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/package.json",
        "/turbo.json",
        "/.nvmrc",
      ],
    },
    start: "pnpm --filter api start",
    healthcheck: "/api/health",
    // Migrate, then make sure the spec's sample data exists. The seed only inserts
    // missing rows, so demo activity survives deploys.
    preDeploy: [
      "pnpm --filter api exec prisma migrate deploy",
      "pnpm --filter api exec prisma db seed",
    ],
    replicas: { iad: 1 },
  });

  return project("distinguished-motivation", {
    variables: { managed: false },
    resources: [api, Postgres, postgresVolume],
  });
});
