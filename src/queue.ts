// import * as Cloudflare from "alchemy/Cloudflare";

// // Messages are pointers only ({ fileId, rawKey }) — never raw file bytes.
// // Queue messages are capped at 128KB, and files can be up to 5MB.

// export const ChunkQueue = Cloudflare.Queues.Queue("ChunkQueue", {
//   name: "fragment-chunk-queue",
// });


import * as Cloudflare from "alchemy/Cloudflare";

// Chunk arrival events, pushed automatically by R2 (object-create
// notifications) whenever a presigned chunk upload lands. Consumer flips
// the matching `chunks` row to 'done' and checks for file completion.
// Messages are R2's own event shape — we don't control the payload format.
export const ChunkQueue = Cloudflare.Queues.Queue("ChunkQueue", {
  name: "fragment-chunk-queue",
});

// One delayed message per upload attempt, sent by the producer at
// upload-init time (delaySeconds ~= worst-case upload window). Consumer
// checks whether the file finished in time; if not, cleans up.
export const UploadTimeoutQueue = Cloudflare.Queues.Queue("UploadTimeoutQueue", {
  name: "fragment-upload-timeout-queue",
});