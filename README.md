# Fragment

Chunked upload/download storage on Cloudflare, loosely modeled on GFS's chunk-based storage. Files are split into fixed-size chunks and stored as independent objects, with a separate metadata layer tracking where each chunk landed and whether the whole file is complete. No resumable uploads, no R2 multipart each chunk is just its own object, matching GFS's framing over faking a real distributed filesystem.


Check out my [Live Deployment](https://fragment-website-dev-ghostuf-7bh3agma6pez7obq.srijan102dahal.workers.dev/)

## Architecture

- **Producer** (Worker) = HTTP API. Initiates uploads, mints one presigned R2 PUT URL per chunk, lists/downloads/deletes files.
- **R2** = stores chunk objects at `chunks/{fileId}/{chunkIndex}`, fires an event notification per chunk arrival.
- **D1** = `files` and `chunks` metadata/status, Drizzle-managed.
- **ChunkQueue** = R2's chunk-arrival events land here.
- **UploadTimeoutQueue** = one delayed message per upload attempt; sweeps abandoned uploads.
- **Consumer** (Worker) =  two independent queue handlers: flips chunk/file status on arrival, cleans up on timeout.
- **Website** = React/Vite SPA, deployed as a Worker with static assets.

Upload never touches Producer for the actual bytes, the browser slices the file client-side and PUTs each chunk straight to R2 via its presigned URL. Producer only handles metadata and signing.

All infra is defined in `alchemy.run.ts`

## File Upload Flow

<img width="1737" height="937" alt="Screenshot From 2026-09-01 22-25-43" src="https://github.com/user-attachments/assets/a0af2240-fba5-41b2-b74e-bc803e28f723" />


## File Download Flow
<img width="1515" height="804" alt="Screenshot From 2026-09-01 22-27-36" src="https://github.com/user-attachments/assets/46bdcd2e-6cee-415c-8491-36d5f1bc56a7" />

## Limits

- 10MB max file size, 5MB chunks (2 chunks max per file)
- 20 files total
- upload timeout scales with file size (250kbps floor, 60s minimum)


## Queries

### Why no kv or DO?

only D1, R2, Secrets Store. D1 is used for file/chunk metadata. Needs real queries (count(), ORDER BY), strong consistency. KV can't do either. R2 is used for chunk bytes. Bulk binary, KV caps at 25MB/value and D1 shouldn't hold blobs. Secrets Store is used for R2 credentials.
(Alchemy itself does use a DO — its own state store, tracking deployed resources. But that's tooling, not app state.)


### What async operation was pushed to a Queue, and why it shouldn't have been synchronous?

In this application a dynamic timeout is selected for each upload according to file size and pushed to a queue for it to send a message to consumer after that delay time which makes the consumer check whether all files arrived accordingly or they did not, if not then it cleans all of it up. 
Can't be sync because, whether a client finishes uploading spans minutes outside one request, and Workers can't hold a handler open that long. Without it, abandoned uploads leak R2 objects + stuck D1 rows forever.

There is one more queue, the chunk queue. from my research i found that the r2 event notification only speaks with a queue. this is the reason for existence of that queue.

### Failure Handled

Abandoned uploads. Delayed queue message checks files.status later. If still pending, deletes the R2 chunks + D1 row. No operations if already complete. This is also safe against duplicate delivery.

## Running it

### Prerequisites
- [Bun](https://bun.sh)
- a Cloudflare account with R2 enabled

### 1. Install dependencies
```bash
bun install
cd web && bun install && cd ..
```

### 2. Authenticate Alchemy against Cloudflare
```bash
bunx alchemy login
```
Interactive OAuth run it yourself, not scriptable.

### 3. Create an R2 API token
Cloudflare dashboard → R2 → Manage API Tokens → **Account API token** (not User,  it shouldn't die if someone leaves the account). Object Read & Write, scoped to all buckets — `fragment-storage` doesn't exist yet on a fresh account.

### 4. Fill in `.env`
```bash
cp .env.example .env
```
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

### 5. Deploy
```bash
bunx alchemy deploy --yes
```
One pass provisions everything R2, D1 (migrations auto-generated from `src/schema.ts`), both queues, Secrets Store, Producer, Consumer, Website. The frontend build picks up Producer's real URL automatically (`alchemy.run.ts` passes `env: { VITE_API_URL: producerUrl }` into the Website resource) no manual URL patching.

## Local frontend dev

`web/.env.local` only matters if you also want to run just the frontend locally against a live backend, outside of Alchemy  i.e. `cd web && bun run dev` (Vite's own dev server). That path never goes through Alchemy's env injection, so Vite falls back to its normal dotenv convention and needs `VITE_API_URL` from a file:

```bash
cp web/.env.example web/.env.local
# fill in VITE_API_URL with the producerUrl your own deploy printed
```

