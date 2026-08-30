// import * as Cloudflare from "alchemy/Cloudflare";

// // Raw uploads + chunked objects both live here.
// // key layout: raw/{fileId}  and  chunks/{fileId}/{chunkIndex}

// export const Bucket = Cloudflare.R2.Bucket("Bucket", {
//   name: "fragment-storage",
// });


import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { ChunkQueue } from "./queue.ts";

// Raw uploads + chunked objects both live here.
// key layout: raw/{fileId}  and  chunks/{fileId}/{chunkIndex}

export const Bucket = Effect.gen(function* () {
  const bucket = yield* Cloudflare.R2.Bucket("Bucket", {
    name: "fragment-storage",
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


// key idea: after every chunk that gets into r2, r2 pushes a message to chunk queue that will initiate a consumer to start processing operations related to the chunk.