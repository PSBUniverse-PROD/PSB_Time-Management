"use client";

import { useRef, useState } from "react";
import { getSupabase } from "@/core/supabase/client";
import { SearchSelect, toastError, toastSuccess } from "@/shared/components/ui";
import {
  createDealerFileUploadAction,
  getDealerFileUrlAction,
  saveDealerFileAction,
} from "../data/dealerPortal.actions";
import {
  DEALER_DOC_TYPES,
  DEALER_FILE_ACCEPT,
  DEALER_FILE_MAX_BYTES,
} from "../data/dealerPortal.data";

const TITLE = "Attachments";
const ACCEPT_LIST = DEALER_FILE_ACCEPT.split(",");
const MAX_MB = Math.floor(DEALER_FILE_MAX_BYTES / (1024 * 1024));
const TYPE_OPTIONS = DEALER_DOC_TYPES.map((type) => ({ value: type.key, label: type.label }));

function typeLabel(key) {
  return DEALER_DOC_TYPES.find((type) => type.key === key)?.label || "Other";
}

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function badgeOf(file) {
  if (file.mime_type === "application/pdf") return "PDF";
  if (file.mime_type === "image/png") return "PNG";
  if (file.mime_type === "image/jpeg") return "JPG";
  return "FILE";
}

/**
 * Paperwork a dealer sends to PSB: pick a document type, upload, and follow
 * each file's review status. The file goes straight from the browser to
 * storage using a one-time target from the server; dealers cannot delete.
 */
export default function DealerAttachments({ initialFiles }) {
  const [files, setFiles] = useState(initialFiles || []);
  const [docType, setDocType] = useState(DEALER_DOC_TYPES[0].key);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function uploadOne(file) {
    if (!ACCEPT_LIST.includes(file.type)) {
      toastError(`${file.name}: only PDF, JPG or PNG files can be uploaded.`, TITLE);
      return;
    }
    if (!(file.size > 0) || file.size > DEALER_FILE_MAX_BYTES) {
      toastError(`${file.name}: files must be ${MAX_MB} MB or smaller.`, TITLE);
      return;
    }

    const meta = { name: file.name, type: file.type, size: file.size, docType };
    const started = await createDealerFileUploadAction(meta);
    if (!started?.success) {
      toastError(`${file.name}: ${started?.error || "Upload failed."}`, TITLE);
      return;
    }

    const { bucket, storagePath, token } = started.upload;
    const { error } = await getSupabase()
      .storage.from(bucket)
      .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });
    if (error) {
      toastError(`${file.name}: ${error.message || "Upload failed."}`, TITLE);
      return;
    }

    const saved = await saveDealerFileAction({ ...meta, storagePath, note });
    if (!saved?.success) {
      toastError(`${file.name}: ${saved?.error || "Upload failed."}`, TITLE);
      return;
    }
    setFiles((prev) => [saved.file, ...prev]);
    toastSuccess(`${file.name} uploaded.`, TITLE);
  }

  async function uploadAll(picked) {
    if (uploading || picked.length === 0) return;
    setUploading(true);
    try {
      // One at a time: every file carries the type and note chosen above.
      for (const file of picked) {
        await uploadOne(file);
      }
      setNote("");
    } catch {
      toastError("Upload failed. Please try again.", TITLE);
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = "";
    uploadAll(picked);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    uploadAll(Array.from(event.dataTransfer?.files || []));
  }

  async function handleOpen(file) {
    // Open the tab during the click so popup blockers allow it, then point
    // it at the link once the server returns it.
    const win = window.open("", "_blank");
    const result = await getDealerFileUrlAction(file.id).catch(() => null);
    if (!result?.success) {
      if (win) win.close();
      toastError(result?.error || "Could not open the file.", TITLE);
      return;
    }
    if (win) win.location.href = result.url;
    else window.location.href = result.url;
  }

  const providedTypes = new Set(files.map((file) => file.doc_type));

  return (
    <div className="dp-split">
      <div className="dp-panel">
        <div className="dp-panel-head">
          <div>
            <h2>{TITLE}</h2>
            <p>Paperwork PSB needs from your dealership.</p>
          </div>
          <span className="dp-pill">{files.length} {files.length === 1 ? "file" : "files"}</span>
        </div>

        <div className="dp-panel-body dp-stack">
          <div className="dp-attach-row">
            <div className="dp-field">
              <label htmlFor="dp-file-type">Document type</label>
              <SearchSelect
                id="dp-file-type"
                options={TYPE_OPTIONS}
                value={docType}
                onChange={(value) => setDocType(value ?? DEALER_DOC_TYPES[0].key)}
                clearable={false}
                disabled={uploading}
              />
            </div>
            <div className="dp-field">
              <label htmlFor="dp-file-note">Note (optional)</label>
              <input id="dp-file-note" type="text" maxLength={200} placeholder="e.g. valid through 2027" value={note} disabled={uploading} onChange={(event) => setNote(event.target.value)} />
            </div>
            <button type="button" className="dp-btn dp-btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Uploading..." : "Choose file"}
            </button>
            <input ref={inputRef} type="file" accept={DEALER_FILE_ACCEPT} multiple hidden onChange={handleInputChange} />
          </div>

          <div
            className={`dp-dropzone${dragOver ? " is-over" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <strong>Drag a file here to upload</strong>
            <span>PDF, JPG or PNG, up to {MAX_MB} MB each</span>
          </div>
        </div>

        {files.length === 0 ? (
          <p className="dp-file-empty">No files uploaded yet.</p>
        ) : (
          <ul className="dp-file-list">
            {files.map((file) => (
              <li key={file.id} className="dp-file">
                <div className="dp-file-main">
                  <span className="dp-file-badge">{badgeOf(file)}</span>
                  <div>
                    <button type="button" className="dp-file-name" onClick={() => handleOpen(file)} title={`Open ${file.file_name}`}>
                      {file.file_name}
                    </button>
                    <div className="dp-file-meta">
                      {[typeLabel(file.doc_type), formatFileSize(file.file_size), file.created_text ? `uploaded ${file.created_text}` : "", file.note || ""].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <span className={`dp-pill ${String(file.status_name).toLowerCase() === "approved" ? "dp-pill-good" : "dp-pill-warn"}`}>
                  {file.status_name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dp-panel">
        <div className="dp-panel-head"><h2>What PSB needs</h2></div>
        <div className="dp-panel-body dp-stack">
          <ul className="dp-needed">
            {DEALER_DOC_TYPES.filter((type) => type.required).map((type) => (
              <li key={type.key} className={providedTypes.has(type.key) ? "is-done" : ""}>
                <span className="dp-tick">{providedTypes.has(type.key) ? "✓" : ""}</span>
                {type.label}
              </li>
            ))}
          </ul>
          <p className="dp-file-meta">Only you and PSB staff can see these files. To remove or replace a file, contact PSB.</p>
        </div>
      </div>
    </div>
  );
}
