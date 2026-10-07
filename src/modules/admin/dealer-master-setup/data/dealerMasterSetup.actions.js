"use server";

import zipcodes from "zipcodes-us";
import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

const DEALER_TABLE = "psb_s_dealermaster";

const REQUIRED_TEXT_FIELDS = { dealer_code: "Dealer code", dealer_name: "Dealer name" };

const OPTIONAL_TEXT_FIELDS = [
  "contact_person",
  "email",
  "phone",
  "mobile",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "tax_id",
  "payment_terms",
  "remarks",
];

// Offline US ZIP data (zipcodes-us) for the cascading State → City → ZIP dropdowns.
// The package has no "list everything" call, so a radius wider than half the
// Earth's circumference (~12,450 miles) is used to pull every ZIP once.
const ALL_ZIPS_CENTER = { latitude: 39.8283, longitude: -98.5795 };
const ALL_ZIPS_RADIUS_MILES = 13000;
let usAddressIndex = null;

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeOptionalText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !(text === "false" || text === "0" || text === "n" || text === "no" || text === "f");
}

function normalizeCreditLimit(value) {
  const text = normalizeText(value);
  if (text === "") return null;
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("Credit limit must be a number of 0 or more.");
  return amount;
}

function buildDealerPayloadFromInput(input) {
  const payload = {};

  for (const [field, label] of Object.entries(REQUIRED_TEXT_FIELDS)) {
    if (!hasOwn(input, field)) continue;
    const text = normalizeText(input[field]);
    if (!text) throw new Error(`${label} is required.`);
    payload[field] = text;
  }
  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (hasOwn(input, field)) payload[field] = sanitizeOptionalText(input[field]);
  }
  if (hasOwn(input, "credit_limit")) {
    payload.credit_limit = normalizeCreditLimit(input.credit_limit);
  }
  if (hasOwn(input, "is_active")) {
    payload.is_active = normalizeBoolean(input.is_active);
  }
  return payload;
}

function assertValidPayload(payload, message) {
  if (!payload || Object.keys(payload).length === 0) throw new Error(message);
}

function toDealerError(error, fallback) {
  // 23505 = unique violation (psb_s_dealermaster_dealer_code_key)
  if (error?.code === "23505") return new Error("Dealer code already exists.");
  return new Error(error?.message || fallback);
}

/**
 * Builds (once per server process) a lookup of
 * stateCode -> Map(cityName -> ZIP list) from the bundled ZIP data.
 */
function getUsAddressIndex() {
  if (usAddressIndex) return usAddressIndex;

  const index = new Map();
  const allZips = zipcodes.findByRadius(ALL_ZIPS_CENTER.latitude, ALL_ZIPS_CENTER.longitude, ALL_ZIPS_RADIUS_MILES);
  for (const info of allZips) {
    const stateCode = normalizeText(info?.stateCode).toUpperCase();
    const city = normalizeText(info?.placeName);
    const zip = normalizeText(info?.zipCode);
    if (!stateCode || !city || !zip) continue;

    if (!index.has(stateCode)) index.set(stateCode, new Map());
    const cities = index.get(stateCode);
    if (!cities.has(city)) cities.set(city, []);
    cities.get(city).push(zip);
  }

  usAddressIndex = index;
  return index;
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
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from(DEALER_TABLE)
    .select("*")
    .order("dealer_name", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch dealers");
  return { dealers: Array.isArray(data) ? data : [] };
}

/**
 * Lists US states for the State dropdown, sorted by name.
 *
 * Returns [] if the ZIP data cannot be read, so the page still renders
 * and the view falls back to plain text inputs.
 */
export async function loadUsStatesAction() {
  try {
    return zipcodes
      .getStates()
      .map((entry) => ({ code: normalizeText(entry?.code).toUpperCase(), name: normalizeText(entry?.name) }))
      .filter((entry) => entry.code && entry.name)
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    console.error("[dealer-master-setup] Failed to load US states:", error?.message || error);
    return [];
  }
}

/**
 * Lists every city in a state together with its ZIP codes, so the view
 * can cascade State → City → ZIP with a single request per state.
 */
export async function loadUsCitiesByStateAction(stateCode) {
  const code = normalizeText(stateCode).toUpperCase();
  if (!code) return [];

  const cities = getUsAddressIndex().get(code);
  if (!cities) return [];

  return Array.from(cities.entries())
    .map(([city, zips]) => ({ city, zips: Array.from(new Set(zips)).sort() }))
    .sort((left, right) => left.city.localeCompare(right.city));
}

/**
 * Inserts a new dealer row.
 *
 * The payload is built from the draft, so only present fields are
 * written and absent optional fields stay untouched (they keep the
 * database defaults). `country` is never sent — the table supplies
 * its own 'US' default.
 */
export async function createDealerAction(payload) {
  const supabase = getSupabaseAdmin();

  const createPayload = buildDealerPayloadFromInput({
    ...(payload || {}),
    dealer_code: payload?.dealer_code,
    dealer_name: payload?.dealer_name,
    is_active: hasOwn(payload || {}, "is_active") ? payload?.is_active : true,
  });

  assertValidPayload(createPayload, "No valid dealer payload supplied.");

  const { data, error } = await supabase.from(DEALER_TABLE).insert(createPayload).select("*").single();
  if (error) throw toDealerError(error, "Failed to create dealer");
  return data;
}

/**
 * Applies a staged edit to an existing dealer row.
 *
 * `updated_at` is stamped here (not in the form) so every write path
 * records the same audit timestamp regardless of who triggered it.
 */
export async function updateDealerAction(dealerId, updates) {
  const supabase = getSupabaseAdmin();

  const payload = buildDealerPayloadFromInput(updates);
  assertValidPayload(payload, "No valid dealer updates supplied.");
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase.from(DEALER_TABLE).update(payload).eq("dealer_id", dealerId).select("*").single();
  if (error) throw toDealerError(error, "Failed to update dealer");
  return data;
}

/** Soft-deactivates a dealer (is_active = false). The row is kept. */
export async function deactivateDealerAction(dealerId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from(DEALER_TABLE)
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("dealer_id", dealerId)
    .select("*")
    .single();
  if (error) throw new Error(error.message || "Failed to deactivate dealer");
  return { dealerId, deactivated: true };
}

/** Permanently removes a dealer row. Only reachable via Save Batch. */
export async function hardDeleteDealerAction(dealerId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from(DEALER_TABLE).delete().eq("dealer_id", dealerId);
  if (error) throw new Error(error.message || "Failed to permanently delete dealer");
  return { dealerId, permanentlyDeleted: true };
}
