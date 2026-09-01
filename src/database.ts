import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle/Schema";
import * as Effect from "effect/Effect";

// regenerates migration SQL from schema.ts on every deploy, no drizzle-kit
// generate step needed
export const Database = Effect.gen(function* () {
  const schema = yield* Drizzle.Schema("app-schema", {
    schema: "./src/schema.ts",
    out: "./migrations",
    dialect: "sqlite",
  });

  return yield* Cloudflare.D1.Database("fragment-db", {
    name: "fragment-db",
    migrationsDir: schema.out,
    migrationsTable: "drizzle_migrations",
  });
});
