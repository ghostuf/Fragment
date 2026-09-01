import { useRef, useState } from "react";
import { uploadFile } from "./api";

interface UploaderProps {
  onUploaded: () => void;
}

export function Uploader({ onUploaded }: UploaderProps) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setProgress(0);
    try {
      await uploadFile(file, setProgress);
      onUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div
      className={`dropzone${dragging ? " dropzone-active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {progress === null ? (
        <>
          <p className="dropzone-title">Drop a file here, or click to browse</p>
          <p className="dropzone-hint">Uploaded in 5MB chunks, direct to R2</p>
        </>
      ) : (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
          <span className="progress-label">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
