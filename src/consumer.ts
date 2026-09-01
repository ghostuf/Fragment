import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle/D1";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { eq, and, count } from "drizzle-orm";
import { Bucket } from "./bucket.ts";
import { Database } from "./database.ts";
import { ChunkQueue, UploadTimeoutQueue } from "./queue.ts";
import { relations, files, chunks } from "./schema.ts";

interface R2EventMessage {
  action: string;
  bucket: string;
  object: { key: string; size: number; eTag: string };
  eventTime: string;
}

interface TimeoutMessage {
  fileId: string;
}

export default Cloudflare.Worker(
  "Consumer",
  { main: import.meta.url },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Bucket);
    const database = yield* Database;
    const d1 = yield* Cloudflare.D1.QueryDatabase(database);
    const db = yield* Drizzle.D1(d1, { relations });

    const chunkQueueResource = yield* ChunkQueue;
    const timeoutQueueResource = yield* UploadTimeoutQueue;

    yield* Cloudflare.Queues.consumeQueueMessages<R2EventMessage>(
      chunkQueueResource,
      (stream) =>
        Stream.runForEach(stream, (msg) =>
          Effect.gen(function* () {
            const [, fileId, chunkIndexStr] = msg.body.object.key.split("/");
            if (!fileId || !chunkIndexStr) {
              return; // malformed key — not one of ours, skip
            }
            const chunkIndex = Number(chunkIndexStr);

            yield* db
              .update(chunks)
              .set({ status: "done" })
              .where(
                and(eq(chunks.fileId, fileId), eq(chunks.chunkIndex, chunkIndex)),
              );

            const doneRows = yield* db
              .select({ value: count() })
              .from(chunks)
              .where(and(eq(chunks.fileId, fileId), eq(chunks.status, "done")));
            const doneCount = doneRows[0]?.value ?? 0;

            const [file] = yield* db
              .select({ totalChunks: files.totalChunks })
              .from(files)
              .where(eq(files.id, fileId));

            if (file && doneCount === file.totalChunks) {
              yield* db
                .update(files)
                .set({ status: "complete" })
                .where(eq(files.id, fileId));
            }
          }),
        ),
    );

    yield* Cloudflare.Queues.consumeQueueMessages<TimeoutMessage>(
      timeoutQueueResource,
      (stream) =>
        Stream.runForEach(stream, (msg) =>
          Effect.gen(function* () {
            const [file] = yield* db
              .select()
              .from(files)
              .where(eq(files.id, msg.body.fileId));

            if (!file || file.status !== "pending") {
              return; // already completed, or already cleaned up
            }

            const expectedChunks = yield* db
              .select({ r2Key: chunks.r2Key })
              .from(chunks)
              .where(eq(chunks.fileId, msg.body.fileId));

            yield* Effect.forEach(
              expectedChunks,
              (c) => bucket.delete(c.r2Key).pipe(Effect.ignore),
              { concurrency: "unbounded" },
            );

            // cascades to chunks rows via FK
            yield* db.delete(files).where(eq(files.id, msg.body.fileId));
          }),
        ),
    );

    return {};
  }).pipe(
    Effect.provide(Cloudflare.Queues.EventSourceLive),
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
  ),
);