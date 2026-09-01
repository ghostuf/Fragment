import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import { Bucket } from "./src/bucket.ts";
import { Database } from "./src/database.ts";
import { ChunkQueue, UploadTimeoutQueue } from "./src/queue.ts";
import * as Drizzle from "alchemy/Drizzle/Providers";
import * as Layer from "effect/Layer";
import Producer from "./src/producer.ts";
import Consumer from "./src/consumer.ts";

export default Alchemy.Stack(
  "Fragment",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), Drizzle.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const bucket = yield* Bucket;
    const db = yield* Database;
    const chunkQueue = yield* ChunkQueue;
    const uploadTimeoutQueue = yield* UploadTimeoutQueue;
    const producer = yield* Producer;
    const consumer = yield* Consumer;

    const producerUrl = Output.map(producer.url, (url) => {
      if (!url) throw new Error("Producer has no reachable URL");
      return url;
    });

    const website = yield* Cloudflare.Website.Vite("Website", {
      rootDir: "web",
      assets: { notFoundHandling: "single-page-application" },
      env: { VITE_API_URL: producerUrl },
    });

    return {
      bucketName: bucket.bucketName,
      dbName: db.databaseName,
      chunkQueueName: chunkQueue.queueName,
      uploadTimeoutQueueName: uploadTimeoutQueue.queueName,
      producerUrl: producer.url,
      websiteUrl: website.url,
    };
  }),
);