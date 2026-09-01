import * as Cloudflare from "alchemy/Cloudflare";

// fed by R2's own event notifications, message shape isn't ours to control
export const ChunkQueue = Cloudflare.Queues.Queue("ChunkQueue", {
  name: "fragment-chunk-queue",
});

// delayed message sent at upload-init, consumer checks if the file made it
export const UploadTimeoutQueue = Cloudflare.Queues.Queue("UploadTimeoutQueue", {
  name: "fragment-upload-timeout-queue",
});
