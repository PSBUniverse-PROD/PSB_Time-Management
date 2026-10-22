"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import {
  DEALER_ACCOUNT_TABLE,
  getDealerSession,
  hashDealerPassword,
  verifyDealerPassword,
} from "@/core/dealer/dealerAuth";
import { assertFileAllowed, createSignedFileUpload, getSignedFileUrl } from "@/core/storage/files.service";
import { loadDealerRecords } from "@/core/dealer/dealerRecordSources";
import { DEALER_DOC_TYPES, DEALER_FILE_ACCEPT, DEALER_FILE_MAX_BYTES } from "./dealerPortal.data";

const DEALER_TABLE = "psb_s_dealermaster";

// `remarks` is PSB's internal note and is deliberately left out.
const DEALER_COLUMNS =
  "dealer_id, dealer_code, dealer_name, contact_person, email, phone, mobile, address_line1, address_line2, city, state, postal_code, country, tax_id, payment_terms, credit_limit, is_active, created_at";

const EDITABLE_FIELDS = {
  company: ["dealer_name", "tax_id"],
  contacts: ["contact_person", "email", "phone", "mobile"],
  address: ["address_line1", "address_line2", "state", "city", "postal_code"],
};

const FIELD_MAX_LENGTH = 200;
const SESSION_ENDED = "Your session has ended. Please sign in again.";

// ── Attachments (psb_m_dealerfile + private bucket dealer-files) ──
const DEALER_FILE_TABLE = "psb_m_dealerfile";
const DEALER_FILE_BUCKET = "dealer-files";
const DEALER_FILE_ALLOWED_TYPES = DEALER_FILE_ACCEPT.split(",");
const DEALER_FILE_LIMIT = 30;
const DEALER_FILE_TEXT_MAX = 200;
// storage_path is deliberately not selected for the browser.
const DEALER_FILE_COLUMNS = "file_id, file_name, file_size, mime_type, doc_type, note, status_id, created_at";
// Review status comes from the shared workflow status table. A new upload
// gets the status with this name; staff move it on from there.
const DEALER_FILE_STATUS_TABLE = "wfk_s_status";
const DEALER_FILE_NEW_STATUS = "Pending";

/** Every dealer's files live under their own folder; nothing else is ever signed for them. */
function dealerFolder(dealerId) {
  return `dealers/${dealerId}`;
}

function isKnownDocType(docType) {
  return DEALER_DOC_TYPES.some((type) => type.key === docType);
}

/** status_id → status_name from the shared workflow status table. */
async function loadFileStatusNames(supabase) {
  const { data, error } = await supabase.from(DEALER_FILE_STATUS_TABLE).select("status_id, status_name");
  if (error) {
    console.error("loadFileStatusNames:", error.message);
    return new Map();
  }
  return new Map((data || []).map((row) => [String(row.status_id), String(row.status_name || "").trim()]));
}

// The date is formatted here so the browser shows exactly what the server rendered.
function toDealerFile(row, statusNames) {
  return {
    id: row.file_id,
    file_name: row.file_name,
    file_size: row.file_size,
    mime_type: row.mime_type,
    doc_type: row.doc_type,
    note: row.note,
    status_name: statusNames.get(String(row.status_id)) || DEALER_FILE_NEW_STATUS,
    created_text: row.created_at
      ? new Date(row.created_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", dateStyle: "medium" })
      : "",
  };
}

async function loadDealerFiles(supabase, dealerId) {
  const [{ data, error }, statusNames] = await Promise.all([
    supabase
      .from(DEALER_FILE_TABLE)
      .select(DEALER_FILE_COLUMNS)
      .eq("dealer_id", dealerId)
      .order("created_at", { ascending: false }),
    loadFileStatusNames(supabase),
  ]);
  if (error) {
    console.error("loadDealerFiles:", error.message);
    return [];
  }
  return (data || []).map((row) => toDealerFile(row, statusNames));
}

/**
 * The signed-in dealer and their login row. The dealer id comes only from the
 * verified session cookie, never from the browser, and both the login and the
 * dealer are re-checked as active on every call. Returns null when not signed in.
 */
async function loadDealerContext({ withPasswordHash = false } = {}) {
  const session = await getDealerSession();
  if (!session?.dealerId) return null;

  const supabase = getSupabaseAdmin();
  const accountColumns = withPasswordHash
    ? "account_id, username, is_active, last_login_at, password_hash"
    : "account_id, username, is_active, last_login_at";

  const [{ data: account }, { data: dealer }] = await Promise.all([
    supabase.from(DEALER_ACCOUNT_TABLE).select(accountColumns).eq("dealer_id", session.dealerId).maybeSingle(),
    supabase.from(DEALER_TABLE).select(DEALER_COLUMNS).eq("dealer_id", session.dealerId).maybeSingle(),
  ]);

  if (!account || account.is_active === false || !dealer || dealer.is_active === false) return null;
  return { supabase, account, dealer };
}

/**
 * Everything a dealer page needs to render.
 * Returns { status: "ok", dealer, username, lastLoginAt } or { status: "no-session" }.
 */
export async function loadDealerAccountData() {
  const context = await loadDealerContext();
  if (!context) return { status: "no-session" };
  return {
    status: "ok",
    dealer: context.dealer,
    username: context.account.username,
    lastLoginAt: context.account.last_login_at || null,
    files: await loadDealerFiles(context.supabase, context.dealer.dealer_id),
    projects: await loadDealerProjects(context.dealer.dealer_id),
  };
}

/**
 * Saves one profile form ("company", "contacts" or "address") for the
 * signed-in dealer. Empty text is stored as NULL.
 */
export async function updateDealerProfileAction(section, values) {
  const context = await loadDealerContext();
  if (!context) return { success: false, error: SESSION_ENDED };

  const fields = EDITABLE_FIELDS[section];
  if (!fields) return { success: false, error: "Unknown form." };

  const payload = {};
  for (const field of fields) {
    const text = String(values?.[field] ?? "").trim();
    if (text.length > FIELD_MAX_LENGTH) {
      return { success: false, error: `One of the fields is too long (maximum ${FIELD_MAX_LENGTH} characters).` };
    }
    payload[field] = text === "" ? null : text;
  }

  if (section === "company" && !payload.dealer_name) {
    return { success: false, error: "Dealer name is required." };
  }
  if (section === "contacts" && payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { success: false, error: "Please enter a valid email address." };
  }
  if (section === "address" && payload.state) {
    payload.state = payload.state.toUpperCase();
  }

  payload.updated_at = new Date().toISOString();

  const { error } = await context.supabase
    .from(DEALER_TABLE)
    .update(payload)
    .eq("dealer_id", context.dealer.dealer_id);
  if (error) {
    console.error("updateDealerProfileAction:", error.message);
    return { success: false, error: "Unable to save your changes. Please try again." };
  }
  return { success: true };
}

/**
 * Changes the signed-in dealer's password. The current password must be
 * given, and the new one must be different and pass the length rules.
 */
export async function changeDealerPasswordAction({ currentPassword, newPassword } = {}) {
  const context = await loadDealerContext({ withPasswordHash: true });
  if (!context) return { success: false, error: SESSION_ENDED };

  const currentOk = await verifyDealerPassword(currentPassword, context.account.password_hash);
  if (!currentOk) return { success: false, error: "Your current password is not correct." };

  if (await verifyDealerPassword(newPassword, context.account.password_hash)) {
    return { success: false, error: "Your new password must be different from the current one." };
  }

  let passwordHash;
  try {
    passwordHash = await hashDealerPassword(newPassword);
  } catch (validationError) {
    return { success: false, error: validationError?.message || "That password can't be used." };
  }

  const { error } = await context.supabase
    .from(DEALER_ACCOUNT_TABLE)
    .update({ password_hash: passwordHash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() })
    .eq("account_id", context.account.account_id);
  if (error) {
    console.error("changeDealerPasswordAction:", error.message);
    return { success: false, error: "Unable to update your password. Please try again." };
  }
  return { success: true };
}

/**
 * Step 1 of an upload: checks the file and returns a one-time upload target
 * inside the signed-in dealer's own folder.
 */
export async function createDealerFileUploadAction({ name, type, size, docType } = {}) {
  const context = await loadDealerContext();
  if (!context) return { success: false, error: SESSION_ENDED };
  if (!isKnownDocType(docType)) return { success: false, error: "Please choose a document type." };

  const dealerId = context.dealer.dealer_id;
  const { count, error: countError } = await context.supabase
    .from(DEALER_FILE_TABLE)
    .select("file_id", { count: "exact", head: true })
    .eq("dealer_id", dealerId);
  if (countError) {
    console.error("createDealerFileUploadAction count:", countError.message);
    return { success: false, error: "Unable to start the upload. Please try again." };
  }
  if ((count || 0) >= DEALER_FILE_LIMIT) {
    return { success: false, error: `You have reached the limit of ${DEALER_FILE_LIMIT} files. Contact PSB to remove old ones.` };
  }

  try {
    const upload = await createSignedFileUpload({
      bucket: DEALER_FILE_BUCKET,
      folder: dealerFolder(dealerId),
      file: { name, type, size },
      maxBytes: DEALER_FILE_MAX_BYTES,
      allowedTypes: DEALER_FILE_ALLOWED_TYPES,
    });
    return { success: true, upload };
  } catch (uploadError) {
    return { success: false, error: uploadError?.message || "Unable to start the upload." };
  }
}

/**
 * Step 2 of an upload: records the uploaded file. The path must be inside the
 * signed-in dealer's own folder, so a dealer can never attach another
 * dealer's file to their account.
 */
export async function saveDealerFileAction({ storagePath, name, type, size, docType, note } = {}) {
  const context = await loadDealerContext();
  if (!context) return { success: false, error: SESSION_ENDED };
  if (!isKnownDocType(docType)) return { success: false, error: "Please choose a document type." };

  const dealerId = context.dealer.dealer_id;
  const path = String(storagePath ?? "");
  if (!path.startsWith(`${dealerFolder(dealerId)}/`) || path.includes("..")) {
    return { success: false, error: "This upload could not be verified. Please try again." };
  }

  try {
    assertFileAllowed({ name, type, size }, { maxBytes: DEALER_FILE_MAX_BYTES, allowedTypes: DEALER_FILE_ALLOWED_TYPES });
  } catch (validationError) {
    return { success: false, error: validationError?.message || "This file can't be used." };
  }

  const statusNames = await loadFileStatusNames(context.supabase);
  const newStatus = Array.from(statusNames.entries()).find(
    ([, statusName]) => statusName.toLowerCase() === DEALER_FILE_NEW_STATUS.toLowerCase(),
  );
  if (!newStatus) {
    console.error(`saveDealerFileAction: no "${DEALER_FILE_NEW_STATUS}" row in ${DEALER_FILE_STATUS_TABLE}`);
    return { success: false, error: "The file uploaded but could not be saved. Please contact PSB." };
  }

  const cleanNote = String(note ?? "").trim().slice(0, DEALER_FILE_TEXT_MAX);
  const { data, error } = await context.supabase
    .from(DEALER_FILE_TABLE)
    .insert({
      dealer_id: dealerId,
      storage_path: path,
      file_name: String(name).trim().slice(0, DEALER_FILE_TEXT_MAX),
      file_size: Number(size) || null,
      mime_type: String(type || "") || null,
      doc_type: docType,
      note: cleanNote || null,
      status_id: Number(newStatus[0]),
      uploaded_by: "dealer",
    })
    .select(DEALER_FILE_COLUMNS)
    .single();
  if (error) {
    console.error("saveDealerFileAction:", error.message);
    return { success: false, error: "The file uploaded but could not be saved. Please try again." };
  }
  return { success: true, file: toDealerFile(data, statusNames) };
}

/** A short-lived link to open one of the signed-in dealer's own files. */
export async function getDealerFileUrlAction(fileId) {
  const context = await loadDealerContext();
  if (!context) return { success: false, error: SESSION_ENDED };

  const { data: row } = await context.supabase
    .from(DEALER_FILE_TABLE)
    .select("storage_path")
    .eq("file_id", fileId)
    .eq("dealer_id", context.dealer.dealer_id)
    .maybeSingle();
  if (!row?.storage_path) return { success: false, error: "File not found." };

  try {
    const url = await getSignedFileUrl({ bucket: DEALER_FILE_BUCKET, storagePath: row.storage_path });
    return { success: true, url };
  } catch (urlError) {
    console.error("getDealerFileUrlAction:", urlError?.message);
    return { success: false, error: "Could not open the file. Please try again." };
  }
}

/**
 * Records linked to the signed-in dealer from every application, read live.
 * The dealer id always comes from the verified session (see loadDealerContext).
 * A failure is logged and shows as an empty list, so the rest of the account
 * page still loads.
 */
async function loadDealerProjects(dealerId) {
  try {
    return await loadDealerRecords(dealerId);
  } catch (recordsError) {
    console.error("loadDealerProjects:", recordsError?.message);
    return [];
  }
}
