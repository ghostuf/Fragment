import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { ChunkQueue } from "./queue.ts";

// key layout: chunks/{fileId}/{chunkIndex}
export const BUCKET_NAME = "fragment-storage";

export const Bucket = Effect.gen(function* () {
  const bucket = yield* Cloudflare.R2.Bucket("Bucket", {
    name: BUCKET_NAME,
    // presigned PUTs are cross-origin, browser preflights them; the SigV4
    // signature is what actually gates access, not CORS
    cors: [
      {
        allowedMethods: ["PUT"],
        allowedOrigins: ["*"],
        allowedHeaders: ["content-type"],
        exposeHeaders: ["etag"],
      },
    ],
  });

  const chunkQueue = yield* ChunkQueue;

  yield* Cloudflare.R2.BucketEventNotification("ChunkUploadNotification", {
    bucketName: bucket.bucketName,
    queueId: chunkQueue.queueId,
    rules: [
      {
        actions: ["PutObject"],
        prefix: "chunks/",
      },
    ],
  });

  return bucket;
});
