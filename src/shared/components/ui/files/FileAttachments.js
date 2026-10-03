"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFile, faFileImage, faFilePdf, faPlus, faTrashCan, faUpload } from "@fortawesome/free-solid-svg-icons";
import { getSupabase } from "@/core/supabase/client";
import Modal from "@/shared/components/ui/overlay/Modal";
import Button from "@/shared/components/ui/controls/Button";
import { toastError, toastSuccess } from "@/shared/components/ui/feedback/Toast";

const DEFAULT_ACCEPT = "image/*,application/pdf";
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

// Hover rules cannot be written as inline styles. No animations by design.
const STYLES = `
.psb-ui-file-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; margin-bottom: 4px; border: 1px solid #e2e8f0; border-radius: 4px; background: #f8fafc; }
.psb-ui-file-row:hover { background: #f1f5f9; border-color: #cbd5e1; }
.psb-ui-file-name { display: block; width: 100%; padding: 0; border: none; background: none; text-align: left; cursor: pointer; font-size: 11px; font-weight: 600; color: #2563eb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.psb-ui-file-name:hover { text-decoration: underline; }
.psb-ui-file-delete { flex-shrink: 0; width: 22px; height: 22px; padding: 0; border: none; border-radius: 4px; background: none; color: #94a3b8; cursor: pointer; font-size: 11px; }
.psb-ui-file-delete:hover { background: #fef2f2; color: #dc2626; }
.psb-ui-file-add { padding: 2px 8px; border: 1px solid #e2e8f0; border-radius: 4px; background: #fff; color: #1e293b; cursor: pointer; font-size: 10px; font-weight: 600; }
.psb-ui-file-add:hover { background: #f8fafc; border-color: #cbd5e1; }
`;

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatFileDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseAccept(accept) {
  return String(accept || "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

/**
 * Mirrors the file input's accept rules for files that did not come through
 * the picker (drag and drop) and for instant feedback without a server call.
 * Entries may be MIME types, "type/*" wildcards, or ".ext" extensions.
 */
function isFileAccepted(file, acceptList) {
  if (acceptList.length === 0) return true;
  const type = String(file.type || "");
  const name = String(file.name || "").toLowerCase();
  return acceptList.some((entry) => {
    if (entry.startsWith(".")) return name.endsWith(entry.toLowerCase());
    if (entry.endsWith("/*")) return type.startsWith(entry.slice(0, -1));
    return type === entry;
  });
}

function describeAccept(acceptList) {
  return acceptList
    .map((entry) => (entry === "application/pdf" ? "PDF" : entry === "image/*" ? "Images" : entry))
    .join(", ");
}

function resolveFileIcon(file) {
  const type = String(file.mime_type || "");
  const name = String(file.file_name || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return { icon: faFilePdf, color: "#dc2626" };
  if (type.startsWith("image/")) return { icon: faFileImage, color: "#2563eb" };
  return { icon: faFile, color: "#64748b" };
}

/**
 * FileAttachments — shared list / upload / open / delete UI for files
 * attached to any record. It owns the UI and the browser-side upload; the
 * module owns the data through the callbacks below (normally thin wrappers
 * around the module's own server actions, which call the core file service).
 *
 * Upload flow: createUpload() returns a one-time signed upload target, the
 * file goes straight to Supabase Storage, then saveFile() records it. The
 * file never passes through a server action. Files can be picked or dropped
 * onto the section; several upload at the same time and each one succeeds
 * or fails on its own.
 *
 * Speed rules this component follows:
 * - No animations or transitions; every state change is immediate.
 * - Wrong type / too large is rejected in the browser, before any request.
 * - Delete is optimistic: the row goes away at once and is restored only if
 *   the module's deleteFile() fails.
 * - The confirmation modal is mounted only while it is open.
 *
 * The parent must pass `key={recordId}` so the list reloads when the user
 * switches to another record.
 *
 * @param {() => Promise<Array<{ id: number, file_name: string, file_size?: number, mime_type?: string, created_at?: string }>>} loadFiles
 * @param {(meta: { name: string, type: string, size: number }) => Promise<{ bucket: string, storagePath: string, token: string }>} createUpload
 * @param {(storagePath: string, meta: { name: string, type: string, size: number }) => Promise<object>} saveFile
 *   Must resolve to the saved row ({ id, file_name, file_size, ... }).
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
  const [pending, setPending] = useState([]); // uploads in flight: { key, name }
  const [confirmFile, setConfirmFile] = useState(null); // file awaiting delete confirmation
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const acceptList = parseAccept(accept);
  const typesLabel = describeAccept(acceptList);
  const maxMb = Math.floor(maxBytes / (1024 * 1024));
  const rulesText = `${typesLabel ? `${typesLabel} only · ` : ""}up to ${maxMb} MB per file`;

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

  /** Uploads one file. Never throws; resolves to true when it was saved. */
  const uploadOne = async (file, key) => {
    try {
      const meta = { name: file.name, type: file.type, size: file.size };
      const { bucket, storagePath, token } = await createUpload(meta);
      const { error } = await getSupabase()
        .storage.from(bucket)
        .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const row = await saveFile(storagePath, meta);
      setFiles((prev) => [row, ...(prev || [])]);
      return true;
    } catch (err) {
      toastError(`${file.name}: ${err?.message || "Upload failed."}`, title);
      return false;
    } finally {
      setPending((prev) => prev.filter((item) => item.key !== key));
    }
  };

  const uploadFiles = async (picked) => {
    const accepted = [];
    for (const file of picked) {
      if (!isFileAccepted(file, acceptList)) {
        toastError(`${file.name} is not an allowed file type.`, title);
        continue;
      }
      if (file.size > maxBytes) {
        toastError(`${file.name} is larger than ${maxMb} MB.`, title);
        continue;
      }
      accepted.push({ file, key: `${Date.now()}_${accepted.length}_${file.name}` });
    }
    if (accepted.length === 0) return;

    setPending((prev) => [...prev, ...accepted.map(({ key, file }) => ({ key, name: file.name }))]);
    const results = await Promise.all(accepted.map(({ file, key }) => uploadOne(file, key)));
    const uploaded = results.filter(Boolean).length;
    if (uploaded > 0) toastSuccess(uploaded === 1 ? "File attached." : `${uploaded} files attached.`, title);
  };

  const handleInputChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again later
    uploadFiles(picked);
  };

  const handleDragOver = (e) => {
    if (!Array.from(e.dataTransfer?.types || []).includes("Files")) return;
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    // Ignore leave events fired while moving over child elements.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    uploadFiles(Array.from(e.dataTransfer?.files || []));
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

  const handleConfirmDelete = async () => {
    const file = confirmFile;
    if (!file) return;
    setConfirmFile(null);
    // Optimistic: drop the row right away, put it back only if the delete fails.
    setFiles((prev) => (prev || []).filter((f) => f.id !== file.id));
    try {
      await deleteFile(file);
      toastSuccess("File deleted.", title);
    } catch (err) {
      setFiles((prev) => ((prev || []).some((f) => f.id === file.id) ? prev : [file, ...(prev || [])]));
      toastError(err?.message || "Could not delete the file.", title);
    }
  };

  const isEmpty = files !== null && files.length === 0 && pending.length === 0;

  return (
    <div
      className="psb-ui-file-attachments"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ marginBottom: "14px", borderRadius: "6px", outline: dragOver ? "2px dashed #2563eb" : "none", outlineOffset: "4px" }}
    >
      <style>{STYLES}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#27374f", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          <u>{title}</u>{files && files.length > 0 ? ` (${files.length})` : ""}
        </div>
        <button type="button" className="psb-ui-file-add" onClick={() => inputRef.current?.click()}>
          <FontAwesomeIcon icon={faPlus} aria-hidden="true" style={{ marginRight: "4px" }} />
          Add file
        </button>
        <input ref={inputRef} type="file" accept={accept} multiple onChange={handleInputChange} style={{ display: "none" }} />
      </div>
      <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "6px" }}>{rulesText}</div>

      {pending.map((item) => (
        <div key={item.key} className="psb-ui-file-row" aria-live="polite">
          <FontAwesomeIcon icon={faUpload} aria-hidden="true" style={{ color: "#94a3b8", fontSize: "13px", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
            <div style={{ fontSize: "9px", color: "#94a3b8" }}>Uploading...</div>
          </div>
        </div>
      ))}

      {files === null ? (
        <div style={{ fontSize: "11px", color: "#94a3b8" }}>Loading...</div>
      ) : isEmpty ? (
        <div style={{ fontSize: "11px", color: "#94a3b8", textAlign: "center", padding: "10px 8px", border: "1px dashed #e2e8f0", borderRadius: "4px" }}>
          No files yet. Drop a file here or use Add file.
        </div>
      ) : (
        files.map((file) => {
          const { icon, color } = resolveFileIcon(file);
          const details = [formatFileSize(file.file_size), formatFileDate(file.created_at)].filter(Boolean).join(" · ");
          return (
            <div key={file.id} className="psb-ui-file-row">
              <FontAwesomeIcon icon={icon} aria-hidden="true" style={{ color, fontSize: "14px", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <button type="button" className="psb-ui-file-name" onClick={() => handleOpen(file)} title={`Open ${file.file_name}`}>
                  {file.file_name}
                </button>
                {details ? <div style={{ fontSize: "9px", color: "#94a3b8" }}>{details}</div> : null}
              </div>
              <button
                type="button"
                className="psb-ui-file-delete"
                onClick={() => setConfirmFile(file)}
                title="Delete file"
                aria-label={`Delete ${file.file_name}`}
              >
                <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" />
              </button>
            </div>
          );
        })
      )}

      {confirmFile ? (
        <Modal
          show
          animation={false}
          onHide={() => setConfirmFile(null)}
          title="Delete attachment"
          footer={
            <>
              <Button variant="outline-secondary" size="sm" onClick={() => setConfirmFile(null)}>Cancel</Button>
              <Button variant="danger" size="sm" onClick={handleConfirmDelete}>Delete</Button>
            </>
          }
        >
          <div style={{ fontSize: "14px", wordBreak: "break-word" }}>
            Delete <strong>{confirmFile.file_name}</strong>? This cannot be undone.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}