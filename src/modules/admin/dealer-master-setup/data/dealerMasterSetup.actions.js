"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { requireDealerAdmin } from "./dealerAdminAccess.js";
import {
  DEALER_ACCOUNT_TABLE,
  hashDealerPassword,
  normalizeDealerUsername,
} from "@/core/dealer/dealerAuth";
import { decryptDealerPassword, encryptDealerPassword } from "@/core/dealer/dealerPasswordVault";
import { removeStoredFiles } from "@/core/storage/files.service";

// ─── Private helpers ───────────────────────────────────────

const DEALER_TABLE = "psb_s_dealermaster";

function normalizeText(value) {
  return String(value ?? "").trim();
}

// An error the user can fix themselves: shown as a short message. Any other
// error is unexpected and opens the error window with details for support.
function expectedError(message) {
  return Object.assign(new Error(message), { expected: true });
}

function toDealerError(error, fallback) {
  // 23505 = unique violation (psb_s_dealermaster_dealer_code_key)
  if (error?.code === "23505") return expectedError("Dealer code already exists.");
  return new Error(error?.message || fallback);
}

// ─── SERVER ACTIONS (called from client) ───────────────────

/**
 * Loads every dealer record for the setup page.
 *
 * Called once from the server page on each request/refresh. Rows are
 * returned in display order (dealer name) so the client hook can use
 * them directly as its seed list.
 */
export async function loadDealerMasterSetupData() {
  await requireDealerAdmin();
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(DEALER_TABLE)
    .select("*")
    .order("dealer_name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch dealers");
  return { dealers: Array.isArray(data) ? data : [] };
}

function toDealerAccountError(error, fallback) {
  if (error?.code === "23505") return expectedError("That username is already in use.");
  return new Error(error?.message || fallback);
}

// Dealer logins may only be read or set by staff with a dealer admin role.
async function loadDealerLogin(dealerId) {
  await requireDealerAdmin();
  if (!dealerId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DEALER_ACCOUNT_TABLE)
    .select("account_id, dealer_id, username, is_active, failed_attempts, locked_until, last_login_at, created_at, updated_at, password_encrypted")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message || "Failed to load dealer login.");
  }

  if (!data) return null;
  // The encrypted copy never goes to the browser, only whether there is one.
  const { password_encrypted: passwordEncrypted, ...account } = data;
  return { ...account, has_password_copy: Boolean(passwordEncrypted) };
}

/**
 * The dealer's current password, for PSB staff only. Null when no readable
 * copy is stored (passwords set before copies were kept).
 */
async function revealDealerPassword(dealerId) {
  await requireDealerAdmin();
  if (!dealerId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DEALER_ACCOUNT_TABLE)
    .select("password_encrypted")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message || "Failed to load dealer password.");
  }

  return decryptDealerPassword(data?.password_encrypted);
}

async function saveDealerLogin(dealerId, input = {}) {
  await requireDealerAdmin();
  if (!dealerId) throw new Error("Dealer is required.");

  const supabase = getSupabaseAdmin();
  const username = normalizeDealerUsername(input?.username);
  const isActive = Boolean(input?.isActive ?? true);
  const password = typeof input?.password === "string" ? input.password : "";

  const { data: existing, error: loadError } = await supabase
    .from(DEALER_ACCOUNT_TABLE)
    .select("account_id, password_hash")
    .eq("dealer_id", dealerId)
    .maybeSingle();

  if (loadError && loadError.code !== "PGRST116") {
    throw new Error(loadError.message || "Failed to load dealer account.");
  }

  const nextPasswordHash = password ? await hashDealerPassword(password) : existing?.password_hash;
  if (!nextPasswordHash) {
    throw expectedError("Password is required.");
  }

  const now = new Date().toISOString();
  const payload = {
    dealer_id: dealerId,
    username,
    password_hash: nextPasswordHash,
    is_active: isActive,
    updated_at: now,
  };
  // Staff setting a new password is also how a locked login is released.
  // The encrypted copy is what staff can view later.
  if (password) {
    payload.password_encrypted = encryptDealerPassword(password);
    payload.failed_attempts = 0;
    payload.locked_until = null;
  }

  if (existing) {
    const { data, error } = await supabase
      .from(DEALER_ACCOUNT_TABLE)
      .update(payload)
      .eq("account_id", existing.account_id)
      .select("account_id, dealer_id, username, is_active, last_login_at, created_at, updated_at")
      .single();

    if (error) throw toDealerAccountError(error, "Failed to update dealer login.");
    return { ...data, created: false };
  }

  const { data, error } = await supabase
    .from(DEALER_ACCOUNT_TABLE)
    .insert({ ...payload, created_at: now })
    .select("account_id, dealer_id, username, is_active, last_login_at, created_at, updated_at")
    .single();

  if (error) throw toDealerAccountError(error, "Failed to create dealer login.");
  return { ...data, created: true };
}

// ─── Enroll, activate/deactivate, delete (saved right away) ─

// Same names as in src/modules/dealer/data/dealerPortal.actions.js.
const DEALER_FILE_TABLE = "psb_m_dealerfile";
const DEALER_FILE_BUCKET = "dealer-files";

// New dealer codes: "D" + a letter + 3 digits — DA001 … DA999, DB001 … DZ999.
// Codes in any other format (older dealers) are left alone and ignored here.
const DEALER_CODE_PATTERN = /^D([A-Z])(\d{3})$/;
const DEALER_CODES_PER_LETTER = 999;
const DEALER_CODE_MAX = 26 * DEALER_CODES_PER_LETTER;
const ENROLL_CODE_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DA001 → 1, DA999 → 999, DB001 → 1000 … DZ999 → 25974; anything else → 0. */
function dealerCodeToNumber(code) {
  const match = DEALER_CODE_PATTERN.exec(normalizeText(code));
  if (!match || Number(match[2]) < 1) return 0;
  return (match[1].charCodeAt(0) - 65) * DEALER_CODES_PER_LETTER + Number(match[2]);
}

function numberToDealerCode(value) {
  const letter = String.fromCharCode(65 + Math.floor((value - 1) / DEALER_CODES_PER_LETTER));
  const number = String(((value - 1) % DEALER_CODES_PER_LETTER) + 1).padStart(3, "0");
  return `D${letter}${number}`;
}

/** The code after the highest DA001–DZ999 code in use. */
async function findNextDealerCode(supabase) {
  const { data, error } = await supabase.from(DEALER_TABLE).select("dealer_code").like("dealer_code", "D%");
  if (error) throw new Error(error.message || "Failed to read dealer codes.");
  const highest = (data || []).reduce((max, row) => Math.max(max, dealerCodeToNumber(row?.dealer_code)), 0);
  if (highest >= DEALER_CODE_MAX) throw new Error("No dealer codes are left (DZ999 is in use).");
  return numberToDealerCode(highest + 1);
}

/**
 * Enrolls a dealer: creates the dealer with the next dealer code and its
 * portal login together. The rest of the dealer's details are filled in
 * afterwards by logging in as the dealer.
 */
async function enrollDealer(input = {}) {
  await requireDealerAdmin();

  const dealerName = normalizeText(input?.dealer_name);
  const email = normalizeText(input?.email);
  const phone = normalizeText(input?.phone);
  if (!dealerName) throw expectedError("Dealer name is required.");
  if (!EMAIL_PATTERN.test(email)) throw expectedError("Please enter a valid email address.");
  if (!phone) throw expectedError("Phone is required.");
  const username = normalizeDealerUsername(input?.username);
  const password = typeof input?.password === "string" ? input.password : "";
  const passwordHash = await hashDealerPassword(password);

  const supabase = getSupabaseAdmin();
  const { data: takenAccount, error: usernameError } = await supabase
    .from(DEALER_ACCOUNT_TABLE)
    .select("account_id")
    .eq("username", username)
    .maybeSingle();
  if (usernameError && usernameError.code !== "PGRST116") {
    throw new Error(usernameError.message || "Failed to check the username.");
  }
  if (takenAccount) throw expectedError("That username is already in use.");

  // Two admins enrolling at once can pick the same code: the unique key on
  // dealer_code refuses the second insert, which then tries the next code.
  let dealer = null;
  for (let attempt = 0; attempt < ENROLL_CODE_ATTEMPTS && !dealer; attempt += 1) {
    const dealerCode = await findNextDealerCode(supabase);
    const { data, error } = await supabase
      .from(DEALER_TABLE)
      .insert({ dealer_code: dealerCode, dealer_name: dealerName, email, phone, is_active: true })
      .select("*")
      .single();
    if (!error) dealer = data;
    else if (error.code !== "23505") throw toDealerError(error, "Failed to enroll dealer.");
  }
  if (!dealer) throw new Error("Could not assign a dealer code. Please try again.");

  const now = new Date().toISOString();
  const { error: accountError } = await supabase.from(DEALER_ACCOUNT_TABLE).insert({
    dealer_id: dealer.dealer_id,
    username,
    password_hash: passwordHash,
    password_encrypted: encryptDealerPassword(password),
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  if (accountError) {
    // A dealer without its login is of no use, so it is removed again.
    await supabase.from(DEALER_TABLE).delete().eq("dealer_id", dealer.dealer_id);
    throw toDealerAccountError(accountError, "Failed to create the dealer login.");
  }

  return { dealer, username };
}

/** Switches a dealer on or off right away. */
async function setDealerActive(dealerId, isActive) {
  await requireDealerAdmin();
  if (!dealerId) throw new Error("Dealer is required.");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(DEALER_TABLE)
    .update({ is_active: Boolean(isActive), updated_at: new Date().toISOString() })
    .eq("dealer_id", dealerId)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to update the dealer.");
  return data;
}

/**
 * Permanently deletes a dealer once the typed code matches its dealer code.
 * The database removes its login, file records and links with it; the
 * uploaded files are then removed from storage.
 */
async function deleteDealer(dealerId, typedCode) {
  await requireDealerAdmin();
  if (!dealerId) throw new Error("Dealer is required.");

  const supabase = getSupabaseAdmin();
  const { data: dealer, error: loadError } = await supabase
    .from(DEALER_TABLE)
    .select("dealer_id, dealer_code")
    .eq("dealer_id", dealerId)
    .maybeSingle();
  if (loadError && loadError.code !== "PGRST116") throw new Error(loadError.message || "Failed to load the dealer.");
  if (!dealer) throw expectedError("That dealer no longer exists.");
  if (normalizeText(typedCode).toUpperCase() !== normalizeText(dealer.dealer_code).toUpperCase()) {
    throw expectedError("The dealer code you typed does not match.");
  }

  const { data: files } = await supabase.from(DEALER_FILE_TABLE).select("storage_path").eq("dealer_id", dealerId);

  const { error } = await supabase.from(DEALER_TABLE).delete().eq("dealer_id", dealerId);
  if (error) throw new Error(error.message || "Failed to delete the dealer.");

  // The dealer is already gone; a storage problem only leaves unused files behind.
  try {
    await removeStoredFiles({ bucket: DEALER_FILE_BUCKET, storagePaths: (files || []).map((file) => file.storage_path) });
  } catch (storageError) {
    console.error("deleteDealer storage:", storageError?.message);
  }
  return { dealerId, deleted: true };
}

// ─── Actions called from the browser ───────────────────────
// Next.js hides the text of errors thrown by server actions in production
// builds, so these return { success: true, data } or { success: false, error }
// and the page shows `error` as it is.

async function toActionResult(work) {
  try {
    return { success: true, data: await work() };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Something went wrong. Please try again.",
      unexpected: !error?.expected,
    };
  }
}

export async function loadDealerLoginAction(dealerId) {
  return toActionResult(() => loadDealerLogin(dealerId));
}

export async function revealDealerPasswordAction(dealerId) {
  return toActionResult(() => revealDealerPassword(dealerId));
}

export async function saveDealerLoginAction(dealerId, input = {}) {
  return toActionResult(() => saveDealerLogin(dealerId, input));
}

export async function enrollDealerAction(input = {}) {
  return toActionResult(() => enrollDealer(input));
}

export async function setDealerActiveAction(dealerId, isActive) {
  return toActionResult(() => setDealerActive(dealerId, isActive));
}

export async function deleteDealerAction(dealerId, typedCode) {
  return toActionResult(() => deleteDealer(dealerId, typedCode));
}
