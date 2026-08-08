import * as Cloudflare from "alchemy/Cloudflare";

// Messages are pointers only ({ fileId, rawKey }) — never raw file bytes.
// Queue messages are capped at 128KB, and files can be up to 5MB.

export const ChunkQueue = Cloudflare.Queues.Queue("ChunkQueue", {
  name: "fragment-chunk-queue",
});
