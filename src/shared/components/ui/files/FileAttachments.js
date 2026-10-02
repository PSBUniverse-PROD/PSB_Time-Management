"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/core/supabase/client";
import { toastError, toastSuccess } from "@/shared/components/ui/feedback/Toast";

const DEFAULT_ACCEPT = "image/*,application/pdf";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * FileAttachments — shared list / upload / open / delete UI for files
 * attached to any record. It owns the UI and the browser-side upload; the
 * module owns the data through the callbacks below (normally thin wrappers
 * around the module's own server actions, which call the core file service).
 *
 * Upload flow: createUpload() returns a one-time signed upload target, the
 * file goes straight to Supabase Storage, then saveFile() records it. The
 * file never passes through a server action.
 *
 * The parent must pass `key={recordId}` so the list reloads when the user
 * switches to another record.
 *
 * @param {() => Promise<Array<{ id: number, file_name: string, file_size?: number }>>} loadFiles
 * @param {(meta: { name: string, type: string, size: number }) => Promise<{ bucket: string, storagePath: string, token: string }>} createUpload
 * @param {(storagePath: string, meta: { name: string, type: string, size: number }) => Promise<object>} saveFile
 *   Must resolve to the saved row ({ id, file_name, file_size }).
 * @param {(file: object) => Promise<string>} getFileUrl - resolves to a link that opens the file
 * @param {(file: object) => Promise<void>} deleteFile
 * @param {string} [title="Attachments"]
 * @param {string} [accept] - value for the file input's accept attribute
 * @param {number} [maxBytes] - client-side size limit (the server must check too)
 */
export default function FileAttachments({
  loadFiles,
  createUpload,
  saveFile,
  getFileUrl,
  deleteFile,
  title = "Attachments",
  accept = DEFAULT_ACCEPT,
  maxBytes = DEFAULT_MAX_BYTES,
}) {
  const [files, setFiles] = useState(null); // null = still loading
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const inputRef = useRef(null);
  const maxMb = Math.floor(maxBytes / (1024 * 1024));

  // The parent usually passes inline callbacks, so their identity changes on
  // every render. Keep the latest loadFiles in a ref and load once per mount
  // (the parent remounts via `key` when the record changes).
  const loadFilesRef = useRef(loadFiles);
  useEffect(() => {
    loadFilesRef.current = loadFiles;
  }, [loadFiles]);

  useEffect(() => {
    let cancelled = false;
    loadFilesRef.current()
      .then((rows) => { if (!cancelled) setFiles(rows || []); })
      .catch((err) => {
        if (cancelled) return;
        setFiles([]);
        toastError(err?.message || "Failed to load attachments.", title);
      });
    return () => { cancelled = true; };
  }, [title]);

  const handleUpload = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again later
    if (picked.length === 0) return;

    setUploading(true);
    let uploaded = 0;
    try {
      for (const file of picked) {
        if (file.size > maxBytes) {
          toastError(`${file.name} is larger than ${maxMb} MB.`, title);
          continue;
        }
        const meta = { name: file.name, type: file.type, size: file.size };
        const { bucket, storagePath, token } = await createUpload(meta);
        const { error } = await getSupabase()
          .storage.from(bucket)
          .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
        if (error) throw new Error(error.message);
        const row = await saveFile(storagePath, meta);
        setFiles((prev) => [row, ...(prev || [])]);
        uploaded += 1;
      }
      if (uploaded > 0) toastSuccess(uploaded === 1 ? "File attached." : `${uploaded} files attached.`, title);
    } catch (err) {
      toastError(err?.message || "Upload failed.", title);
    } finally {
      setUploading(false);
    }
  };

  const handleOpen = async (file) => {
    // Open the tab during the click so popup blockers allow it, then point
    // it at the link once the module returns it.
    const win = window.open("", "_blank");
    try {
      const url = await getFileUrl(file);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (err) {
      if (win) win.close();
      toastError(err?.message || "Could not open the file.", title);
    }
  };

  const handleDelete = async (file) => {
    if (busyId || !window.confirm(`Delete ${file.file_name}? This cannot be undone.`)) return;
    setBusyId(file.id);
    try {
      await deleteFile(file);
      setFiles((prev) => (prev || []).filter((f) => f.id !== file.id));
      toastSuccess("File deleted.", title);
    } catch (err) {
      toastError(err?.message || "Could not delete the file.", title);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="psb-ui-file-attachments" style={{ marginBottom: "14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#27374f", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <u>{title}</u>{files && files.length > 0 ? ` (${files.length})` : ""}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{ fontSize: "10px", fontWeight: 600, padding: "2px 8px", borderRadius: "4px", border: "1px solid #e2e8f0", background: "#fff", color: "#1e293b", cursor: uploading ? "not-allowed" : "pointer", opacity: uploading ? 0.6 : 1 }}
        >
          {uploading ? "Uploading..." : "+ Add file"}
        </button>
        <input ref={inputRef} type="file" accept={accept} multiple onChange={handleUpload} style={{ display: "none" }} />
      </div>

      {files === null ? (
        <div style={{ fontSize: "11px", color: "#94a3b8" }}>Loading...</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: "11px", color: "#94a3b8" }}>No files attached. Up to {maxMb} MB each.</div>
      ) : (
        files.map((file) => (
          <div key={file.id} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 0", borderBottom: "1px solid #f2f2f2" }}>
            <button
              type="button"
              onClick={() => handleOpen(file)}
              title={file.file_name}
              style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "11px", fontWeight: 600, color: "#2563eb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {file.file_name}
            </button>
            <span style={{ fontSize: "9px", color: "#94a3b8", flexShrink: 0 }}>{formatFileSize(file.file_size)}</span>
            <button
              type="button"
              onClick={() => handleDelete(file)}
              disabled={busyId === file.id}
              title="Delete file"
              aria-label={`Delete ${file.file_name}`}
              style={{ background: "none", border: "none", color: "#dc2626", cursor: busyId === file.id ? "default" : "pointer", fontSize: "14px", fontWeight: 700, padding: 0, lineHeight: 1, opacity: busyId === file.id ? 0.5 : 1, flexShrink: 0 }}
            >×</button>
          </div>
        ))
      )}
    </div>
  );
}