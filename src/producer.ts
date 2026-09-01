import * as Cloudflare from "alchemy/Cloudflare";
import * as Drizzle from "alchemy/Drizzle/D1";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { eq, asc, desc, count } from "drizzle-orm";
import { AwsClient } from "aws4fetch";
import type { RuntimeContext } from "alchemy";
import { Bucket, BUCKET_NAME } from "./bucket.ts";
import { Database } from "./database.ts";
import { UploadTimeoutQueue } from "./queue.ts";
import { R2Credentials } from "./secrets.ts";
import { relations, files, chunks } from "./schema.ts";

const CHUNK_SIZE = 5 * 1024 * 1024; // 2 chunks
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 20; 

// timeout scales with size instead of one flat worst-case constant, floored
const WORST_CASE_BYTES_PER_SECOND = 250_000 / 8; // 250kbps floor
const TIMEOUT_BUFFER_MULTIPLIER = 2.5;
const MIN_TIMEOUT_SECONDS = 60;

function timeoutSecondsFor(sizeBytes: number): number {
  const rawSeconds = sizeBytes / WORST_CASE_BYTES_PER_SECOND;
  return Math.max(
    MIN_TIMEOUT_SECONDS,
    Math.ceil(rawSeconds * TIMEOUT_BUFFER_MULTIPLIER),
  );
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export default Cloudflare.Worker(
  "Producer",
  { main: import.meta.url },
  Effect.gen(function* () {
    const bucket = yield* Cloudflare.R2.ReadWriteBucket(Bucket);
    const database = yield* Database;
    const d1 = yield* Cloudflare.D1.QueryDatabase(database);
    const db = yield* Drizzle.D1(d1, { relations });
    const timeoutQueueResource = yield* UploadTimeoutQueue;
    const timeoutQueue = yield* Cloudflare.Queues.WriteQueue(timeoutQueueResource);

    const credentials = yield* R2Credentials;
    const accountIdSecret = yield* Cloudflare.SecretsStore.ReadSecret(
      credentials.accountId,
    );
    const accessKeyIdSecret = yield* Cloudflare.SecretsStore.ReadSecret(
      credentials.accessKeyId,
    );
    const secretAccessKeySecret = yield* Cloudflare.SecretsStore.ReadSecret(
      credentials.secretAccessKey,
    );

    return {
      fetch: Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        if (request.method === "OPTIONS") {
          return HttpServerResponse.empty({ status: 204 });
        }

        if (request.method === "GET") {
          const url = new URL(request.url, "http://localhost");

          if (url.pathname === "/files") {
            const rows = yield* db
              .select({
                id: files.id,
                filename: files.filename,
                size: files.size,
                status: files.status,
                createdAt: files.createdAt,
              })
              .from(files)
              .orderBy(desc(files.createdAt))
              .pipe(Effect.orDie);

            return yield* HttpServerResponse.json(rows);
          }

          const match = url.pathname.match(/^\/download\/([^/]+)$/);
          const fileId = match?.[1];
          if (!fileId) {
            return HttpServerResponse.empty({ status: 404 });
          }

          const [file] = yield* db
            .select()
            .from(files)
            .where(eq(files.id, fileId))
            .pipe(Effect.orDie);

          if (!file || file.status !== "complete") {
            return HttpServerResponse.empty({ status: 404 });
          }

          const chunkRows = yield* db
            .select({ r2Key: chunks.r2Key })
            .from(chunks)
            .where(eq(chunks.fileId, fileId))
            .orderBy(asc(chunks.chunkIndex))
            .pipe(Effect.orDie);

          // response body runs outside this fiber once returned, so bucket
          // reads need their own captured context instead of the ambient one
          const ctx = yield* Effect.context<RuntimeContext>();
          const readChunk = Effect.runPromiseWith(ctx);

          let nextIndex = 0;

          // pulls one chunk at a time, in order — never holds the full file
          const fileStream = new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (nextIndex >= chunkRows.length) {
                controller.close();
                return;
              }
              const chunkRow = chunkRows[nextIndex]!;
              nextIndex++;

              const bytes = await readChunk(
                Effect.gen(function* () {
                  const obj = yield* bucket.get(chunkRow.r2Key);
                  if (!obj) {
                    return yield* Effect.die(
                      new Error(`missing chunk object: ${chunkRow.r2Key}`),
                    );
                  }
                  return yield* obj.bytes();
                }),
              );
              controller.enqueue(bytes);
            },
          });

          return HttpServerResponse.raw(fileStream, {
            contentType: "application/octet-stream",
            contentLength: file.size,
            headers: {
              "content-disposition": `attachment; filename="${file.filename}"`,
            },
          });
        }

        if (request.method === "DELETE") {
          const url = new URL(request.url, "http://localhost");
          const match = url.pathname.match(/^\/files\/([^/]+)$/);
          const fileId = match?.[1];
          if (!fileId) {
            return HttpServerResponse.empty({ status: 404 });
          }

          const [file] = yield* db
            .select({ id: files.id })
            .from(files)
            .where(eq(files.id, fileId))
            .pipe(Effect.orDie);

          if (!file) {
            return HttpServerResponse.empty({ status: 404 });
          }

          const chunkRows = yield* db
            .select({ r2Key: chunks.r2Key })
            .from(chunks)
            .where(eq(chunks.fileId, fileId))
            .pipe(Effect.orDie);

          yield* Effect.forEach(
            chunkRows,
            (c) => bucket.delete(c.r2Key).pipe(Effect.ignore),
            { concurrency: "unbounded" },
          );

          // cascades to chunks rows via FK
          yield* db.delete(files).where(eq(files.id, fileId)).pipe(Effect.orDie);

          return HttpServerResponse.empty({ status: 204 });
        }

        const body = yield* request.json as Effect.Effect<{
          filename: string;
          size: number;
        }>;

        if (body.size > MAX_FILE_SIZE) {
          return yield* HttpServerResponse.json(
            { error: `file too large — max ${MAX_FILE_SIZE} bytes` },
            { status: 413 },
          );
        }

        const fileCountRows = yield* db
          .select({ value: count() })
          .from(files)
          .pipe(Effect.orDie);
        const fileCount = fileCountRows[0]?.value ?? 0;

        if (fileCount >= MAX_FILES) {
          return yield* HttpServerResponse.json(
            { error: `file limit reached — max ${MAX_FILES} files, delete some first` },
            { status: 403 },
          );
        }

        const fileId = crypto.randomUUID();
        const totalChunks = Math.max(1, Math.ceil(body.size / CHUNK_SIZE));

        yield* db
          .insert(files)
          .values({
            id: fileId,
            filename: body.filename,
            size: body.size,
            totalChunks,
            status: "pending",
          })
          .pipe(Effect.orDie);

        const chunkRows = Array.from({ length: totalChunks }, (_, i) => {
          const chunkSize = Math.min(CHUNK_SIZE, body.size - i * CHUNK_SIZE);
          return {
            fileId,
            chunkIndex: i,
            r2Key: `chunks/${fileId}/${i}`,
            size: chunkSize,
            status: "pending" as const,
          };
        });

        yield* db.insert(chunks).values(chunkRows).pipe(Effect.orDie);

        const timeoutSeconds = timeoutSecondsFor(body.size);

        const accountId = Redacted.value(yield* accountIdSecret.pipe(Effect.orDie));
        const accessKeyId = Redacted.value(
          yield* accessKeyIdSecret.pipe(Effect.orDie),
        );
        const secretAccessKey = Redacted.value(
          yield* secretAccessKeySecret.pipe(Effect.orDie),
        );

        const aws = new AwsClient({ accessKeyId, secretAccessKey });

        // signQuery puts the signature in the URL itself, no auth needed client-side
        const uploadUrls = yield* Effect.forEach(
          chunkRows,
          (c) =>
            Effect.promise(async () => {
              const url = new URL(
                `https://${accountId}.r2.cloudflarestorage.com/${BUCKET_NAME}/${c.r2Key}`,
              );
              url.searchParams.set("X-Amz-Expires", String(timeoutSeconds));
              const signed = await aws.sign(url, {
                method: "PUT",
                aws: { signQuery: true },
              });
              return { chunkIndex: c.chunkIndex, url: signed.url };
            }),
          { concurrency: "unbounded" },
        );

        // WriteQueueClient.send has no delaySeconds option, raw binding does
        const rawTimeoutQueue = yield* timeoutQueue.raw;
        yield* Effect.tryPromise(() =>
          rawTimeoutQueue.send({ fileId }, { delaySeconds: timeoutSeconds }),
        ).pipe(Effect.orDie);

        return yield* HttpServerResponse.json({ fileId, uploadUrls });
      }).pipe(Effect.map(HttpServerResponse.setHeaders(CORS_HEADERS))),
    };
  }).pipe(
    Effect.provide(Cloudflare.R2.ReadWriteBucketBinding),
    Effect.provide(Cloudflare.D1.QueryDatabaseBinding),
    Effect.provide(Cloudflare.Queues.WriteQueueBinding),
    Effect.provide(Cloudflare.SecretsStore.ReadSecretBinding),
  ),
);