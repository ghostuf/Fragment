import * as Cloudflare from "alchemy/Cloudflare";

// files: master metadata (GFS "master" analog)
// chunks: chunk -> R2 key mapping, with per-chunk status for resumable retries


export const Database = Cloudflare.D1.Database("Database", {
    name: "fragment-db",
    migrationsDir: "./migrations",
});
