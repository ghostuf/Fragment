import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { Bucket } from "./src/bucket.ts";
import { Database } from "./src/database.ts";
import { ChunkQueue } from "./src/queue.ts";
import * as Drizzle from "alchemy/Drizzle/Providers";
import * as Layer from "effect/Layer";


export default Alchemy.Stack(
  "Fragment",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const bucket = yield* Bucket;
    const db = yield* Database;
    const queue = yield* ChunkQueue;

    return {
      bucketName: bucket.bucketName,
      dbName: db.databaseName,
      queueName: queue.queueName
    };
  }),
);