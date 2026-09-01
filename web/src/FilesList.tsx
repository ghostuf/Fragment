import { useEffect, useState } from "react";
import { deleteFile, downloadUrl, listFiles, MAX_FILES, type FileRecord } from "./api";
import { formatBytes } from "./formatBytes";

const POLL_INTERVAL_MS = 3000;

interface FilesListProps {
  refreshSignal: number;
}

export function FilesList({ refreshSignal }: FilesListProps) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // stops polling once nothing's pending, resumes on visibility
    async function tick() {
      if (cancelled) return;
      try {
        const rows = await listFiles();
        if (cancelled) return;
        setFiles(rows);
        setError(null);

        const stillPending = rows.some((f) => f.status === "pending");
        if (stillPending && !document.hidden) {
          timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "failed to load files");
        }
      }
    }

    function onVisibilityChange() {
      if (!document.hidden) tick();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshSignal]);

  async function handleDelete(file: FileRecord) {
    if (!window.confirm(`Delete "${file.filename}"?`)) return;
    setDeletingId(file.id);
    try {
      await deleteFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <h2>
        Files <span className="file-count">{files.length}/{MAX_FILES}</span>
      </h2>

      {error && <p className="error">{error}</p>}

      {!error && files.length === 0 && (
        <p className="empty">No files yet — upload one above.</p>
      )}

      {!error && files.length > 0 && (
        <table className="files-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Status</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <td className="filename">{file.filename}</td>
                <td>{formatBytes(file.size)}</td>
                <td>
                  <span className={`badge badge-${file.status}`}>{file.status}</span>
                </td>
                <td>{new Date(file.createdAt).toLocaleString()}</td>
                <td>
                  <div className="actions">
                    {file.status === "complete" && (
                      <a
                        className="download"
                        href={downloadUrl(file.id)}
                        download={file.filename}
                      >
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      className="trash-button"
                      aria-label={`Delete ${file.filename}`}
                      disabled={deletingId === file.id}
                      onClick={() => handleDelete(file)}
                    >
                      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
                        <path
                          d="M2.5 4h11M6 4V2.5h4V4M6.5 7v4.5M9.5 7v4.5M3.5 4l.6 8.4a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9L12.5 4"
                          stroke="currentColor"
                          strokeWidth="1.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
