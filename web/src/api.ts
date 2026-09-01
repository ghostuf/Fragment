export const API_URL = import.meta.env.VITE_API_URL;

// keep in sync with src/producer.ts
const CHUNK_SIZE = 5 * 1024 * 1024;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_FILES = 20;

export type FileStatus = "pending" | "complete" | "error";

export interface FileRecord {
  id: string;
  filename: string;
  size: number;
  status: FileStatus;
  createdAt: string;
}

export async function listFiles(): Promise<FileRecord[]> {
  const res = await fetch(`${API_URL}/files`);
  if (!res.ok) {
    throw new Error(`failed to list files: ${res.status}`);
  }
  return res.json();
}

export function downloadUrl(fileId: string): string {
  return `${API_URL}/download/${fileId}`;
}

export async function deleteFile(fileId: string): Promise<void> {
  const res = await fetch(`${API_URL}/files/${fileId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`failed to delete file: ${res.status}`);
  }
}

interface InitUploadResponse {
  fileId: string;
  uploadUrls: { chunkIndex: number; url: string }[];
}

export async function uploadFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`file too large — max ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
  }

  const initRes = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, size: file.size }),
  });
  if (!initRes.ok) {
    throw new Error(`failed to start upload: ${initRes.status}`);
  }
  const { fileId, uploadUrls }: InitUploadResponse = await initRes.json();

  const uploadedPerChunk = new Array(uploadUrls.length).fill(0);
  const reportProgress = () => {
    if (!onProgress) return;
    const uploaded = uploadedPerChunk.reduce((a, b) => a + b, 0);
    onProgress(uploaded / file.size);
  };

  await Promise.all(
    uploadUrls.map(async ({ chunkIndex, url }) => {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const blob = file.slice(start, end);

      await putChunk(url, blob, (loaded) => {
        uploadedPerChunk[chunkIndex] = loaded;
        reportProgress();
      });
    }),
  );

  return fileId;
}

// fetch() has no upload progress event, XHR does
function putChunk(
  url: string,
  body: Blob,
  onProgress: (loadedBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(body.size);
        resolve();
      } else {
        reject(new Error(`chunk upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("chunk upload network error"));
    xhr.send(body);
  });
}
