import "server-only";
import { getSupabaseAdmin } from "@/core/supabase/admin";

/**
 * Core file storage service (Supabase Storage).
 *
 * These are plain server-only functions, NOT server actions. Call them from
 * your module's own server actions, after the module has done its own checks
 * (which record the file belongs to, whether the user may touch it). That
 * keeps the browser from asking for a signed URL to an arbitrary path.
 *
 * Upload flow:
 *   1. module action -> createSignedFileUpload()  (one-time upload target)
 *   2. browser       -> uploads the file straight to Storage
 *                       (the shared FileAttachments component does this)
 *   3. module action -> saves its own row with the returned storagePath
 *
 * Core stores nothing in the database: each module owns its own file table
 * and chooses the bucket and folder.
 */

export const DEFAULT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_FILE_TYPES = ["image/*", "application/pdf"];
const DEFAULT_URL_TTL_SECONDS = 300;

function requireText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function isTypeAllowed(type, allowedTypes) {
  return allowedTypes.some((allowed) =>
    allowed.endsWith("/*") ? type.startsWith(allowed.slice(0, -1)) : type === allowed
  );
}

/**
 * Throws when the file metadata breaks the rules.
 *
 * @param {{ name: string, type: string, size: number }} file
 * @param {{ maxBytes?: number, allowedTypes?: string[] }} [options]
 *   allowedTypes accepts exact MIME types and "type/*" wildcards.
 */
export function assertFileAllowed(file, { maxBytes = DEFAULT_FILE_MAX_BYTES, allowedTypes = DEFAULT_FILE_TYPES } = {}) {
  if (!file) throw new Error("File is required.");
  requireText(file.name, "File name");
  if (!isTypeAllowed(String(file.type || ""), allowedTypes)) {
    throw new Error("This file type is not allowed.");
  }
  const size = Number(file.size);
  if (!(size > 0) || size > maxBytes) {
    throw new Error(`File must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`);
  }
}

/**
 * Validates the file and returns a one-time signed upload target.
 *
 * @param {{ bucket: string, folder: string, file: { name: string, type: string, size: number }, maxBytes?: number, allowedTypes?: string[] }} params
 *   folder is the owner's folder inside the bucket, e.g. "projects/42".
 * @returns {Promise<{ bucket: string, storagePath: string, token: string }>}
 */
export async function createSignedFileUpload({ bucket, folder, file, maxBytes, allowedTypes }) {
  const bucketName = requireText(bucket, "bucket");
  const cleanFolder = requireText(folder, "folder").replace(/^\/+|\/+$/g, "");
  assertFileAllowed(file, { maxBytes, allowedTypes });

  const safeName = String(file.name).replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const storagePath = `${cleanFolder}/${Date.now()}_${safeName}`;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(bucketName).createSignedUploadUrl(storagePath);
  if (error) throw new Error(error.message);
  return { bucket: bucketName, storagePath: data.path, token: data.token };
}

/**
 * Returns a short-lived link to open or download one stored file.
 *
 * @param {{ bucket: string, storagePath: string, expiresIn?: number }} params
 * @returns {Promise<string>}
 */
export async function getSignedFileUrl({ bucket, storagePath, expiresIn = DEFAULT_URL_TTL_SECONDS }) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(requireText(bucket, "bucket"))
    .createSignedUrl(requireText(storagePath, "storagePath"), expiresIn);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

/**
 * Permanently removes stored files. Throws on failure; callers that must
 * not be blocked by a storage hiccup should catch.
 *
 * @param {{ bucket: string, storagePaths: string[] }} params
 */
export async function removeStoredFiles({ bucket, storagePaths }) {
  const paths = (storagePaths || []).filter(Boolean);
  if (paths.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(requireText(bucket, "bucket")).remove(paths);
  if (error) throw new Error(error.message);
}