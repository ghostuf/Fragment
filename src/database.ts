import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle";
import * as Effect from "effect/Effect";

// Drizzle.Schema regenerates migration SQL from schema.ts on every deploy;
// its `out` feeds directly into D1's migrationsDir, so there's no separate
// `drizzle-kit generate` step to remember to run before deploying.

export const Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts", // root relative
    out: "./migrations", // same here
    dialect: "sqlite",
  });

  return yield* Cloudflare.D1.Database("fragment-db", {
    name: "fragment-db",
    migrationsDir: schema.out,
    migrationsTable: "drizzle_migrations",
  });
});