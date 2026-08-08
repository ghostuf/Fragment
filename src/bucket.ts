import * as Cloudflare from "alchemy/Cloudflare";

// Raw uploads + chunked objects both live here.
// key layout: raw/{fileId}  and  chunks/{fileId}/{chunkIndex}

export const Bucket = Cloudflare.R2.Bucket("Bucket", {
  name: "fragment-storage",
});
