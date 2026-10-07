/**
 * Dealer Master Setup — Data Layer (client-safe utilities)
 *
 * Pure helpers shared between page and view:
 * - Form field definitions and draft helpers
 * - Model helpers (normalization, display)
 * - Utility functions
 * - Batch save orchestration (via Server Actions)
 */

import {
  createDealerAction,
  updateDealerAction,
  deactivateDealerAction,
  hardDeleteDealerAction,
} from "./dealerMasterSetup.actions.js";

// ─── FORM DEFINITION ───────────────────────────────────────

// kind: "state" | "city" | "zip" render as cascading dropdowns (State → City → ZIP).
export const DEALER_FORM_SECTIONS = [
  {
    title: "Dealer",
    fields: [
      { key: "dealer_code", label: "Dealer Code", col: "col-12 col-md-4", required: true, placeholder: "Enter dealer code" },
      { key: "dealer_name", label: "Dealer Name", col: "col-12 col-md-8", required: true, placeholder: "Enter dealer name" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { key: "contact_person", label: "Contact Person", col: "col-12 col-md-6", placeholder: "Enter contact person" },
      { key: "email", label: "Email", col: "col-12 col-md-6", type: "email", placeholder: "Enter email" },
      { key: "phone", label: "Phone", col: "col-12 col-md-6", placeholder: "Enter phone" },
      { key: "mobile", label: "Mobile", col: "col-12 col-md-6", placeholder: "Enter mobile" },
    ],
  },
  {
    title: "Address",
    fields: [
      { key: "address_line1", label: "Address Line 1", col: "col-12", placeholder: "Enter address line 1" },
      { key: "address_line2", label: "Address Line 2", col: "col-12", placeholder: "Suite, unit, building (optional)" },
      { key: "state", label: "State", col: "col-12 col-md-4", kind: "state", placeholder: "e.g. TX" },
      { key: "city", label: "City", col: "col-12 col-md-4", kind: "city", placeholder: "Enter city" },
      { key: "postal_code", label: "ZIP Code", col: "col-12 col-md-4", kind: "zip", placeholder: "Enter ZIP code" },
    ],
  },
  {
    title: "Business / Tax",
    fields: [
      { key: "tax_id", label: "Tax ID", col: "col-12 col-md-4", placeholder: "Enter tax ID" },
      { key: "payment_terms", label: "Payment Terms", col: "col-12 col-md-4", placeholder: "Enter payment terms" },
      { key: "credit_limit", label: "Credit Limit", col: "col-12 col-md-4", type: "number", placeholder: "0.00" },
      { key: "remarks", label: "Remarks", col: "col-12", textarea: true, placeholder: "Enter remarks (optional)" },
    ],
  },
];

export const DEALER_FIELD_KEYS = DEALER_FORM_SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

/** An all-empty draft used when adding a new dealer. */
export function createEmptyDealerDraft() {
  const draft = {};
  DEALER_FIELD_KEYS.forEach((key) => { draft[key] = ""; });
  return draft;
}

/** Copies a stored row into a draft so the form shows its current values. */
export function createDealerDraftFromRow(row) {
  const draft = {};
  DEALER_FIELD_KEYS.forEach((key) => { draft[key] = String(row?.[key] ?? ""); });
  return draft;
}

/**
 * Converts a form draft into the payload sent to the server actions.
 *
 * Empty strings become null so cleared fields are stored as NULL
 * rather than whitespace, and the server layer re-validates anything
 * that is required.
 */
export function buildDealerPayloadFromDraft(draft) {
  const payload = {};
  DEALER_FIELD_KEYS.forEach((key) => {
    const text = normalizeText(draft?.[key]);
    payload[key] = text === "" ? null : text;
  });
  return payload;
}

/** Credit limits must be a finite number of 0 or more (the column is numeric(14,2)). */
export function isValidCreditLimit(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0;
}

// ─── MODEL HELPERS ─────────────────────────────────────────

/**
 * Reads the active flag defensively.
 *
 * Supabase returns a boolean, but staged/temp rows built in the
 * browser may carry a string, so every falsy spelling is accepted.
 */
export function isDealerActive(dealer) {
  if (dealer?.is_active === false || dealer?.is_active === 0) return false;
  const text = String(dealer?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

/**
 * Normalizes a raw database row into the shape the table renders.
 * `is_active_bool` is the value the Active badge and row actions read.
 */
export function mapDealerRow(dealer, index) {
  return {
    ...dealer,
    id: dealer?.dealer_id ?? `dealer-${index}`,
    is_active_bool: isDealerActive(dealer),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

/** Compares ids as strings so numbers and temp ids can be mixed safely. */
export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

/** Case-insensitive, human-friendly text ordering (10 sorts after 9). */
export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

/** Returns a copy of the object without the given key. */
export function removeObjectKey(objectValue, keyToRemove) {
  const normalizedKey = String(keyToRemove ?? "");
  const nextObject = {};
  Object.entries(objectValue || {}).forEach(([key, value]) => {
    if (key !== normalizedKey) {
      nextObject[key] = value;
    }
  });
  return nextObject;
}

/**
 * Merges a field patch into the pending updates for one dealer.
 * Undefined values are ignored so an untouched field never overwrites
 * an edit that was already staged in this batch.
 */
export function mergeUpdatePatch(previousPatch, nextPatch) {
  const mergedPatch = { ...(previousPatch || {}) };
  Object.entries(nextPatch || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      mergedPatch[key] = value;
    }
  });
  return mergedPatch;
}

/** Adds an id to a list only if it is not already present. */
export function appendUniqueId(idList, value) {
  const normalizedValue = String(value ?? "");
  if (!normalizedValue) return Array.isArray(idList) ? [...idList] : [];
  const existing = Array.isArray(idList) ? idList : [];
  if (existing.some((entry) => isSameId(entry, normalizedValue))) return [...existing];
  return [...existing, normalizedValue];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_DEALER_PREFIX = "tmp-dealer-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** True while the dealer only exists in this browser session (not yet saved). */
export function isTempDealerId(value) {
  return String(value ?? "").startsWith(TEMP_DEALER_PREFIX);
}

export function createEmptyDealerChanges() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

/**
 * Writes every staged change to the database in a fixed order:
 * creates → updates → deactivations → hard deletes.
 *
 * Why that order matters:
 * - Creations run first so edits staged against a not-yet-saved dealer
 *   can be redirected to its real id through `tempIdMap`.
 * - A dealer being deactivated or deleted is skipped for updates so we
 *   never fight over the same row.
 * - Temp (unsaved) dealers can only be created or discarded, so they are
 *   skipped in every later phase.
 *
 * Runs sequentially because each step depends on the id returned by the
 * previous one. Any failure throws and is surfaced as a toast by the
 * caller; already-written rows are not rolled back.
 */
export async function executeBatchSave(dealerChanges) {
  const deactivatedSet = new Set(
    [...(dealerChanges.deactivations || []), ...(dealerChanges.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const tempIdMap = new Map();

  for (const createEntry of dealerChanges.creates || []) {
    const created = await createDealerAction(createEntry.payload);
    const createdId = created?.dealer_id;
    if (createdId === undefined || createdId === null || createdId === "") {
      throw new Error("Created dealer response is invalid.");
    }
    tempIdMap.set(String(createEntry.tempId), createdId);
  }

  for (const [dealerId, updates] of Object.entries(dealerChanges.updates || {})) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (deactivatedSet.has(String(resolvedDealerId))) continue;
    if (isTempDealerId(resolvedDealerId)) continue;
    if (Object.keys(updates || {}).length === 0) continue;
    await updateDealerAction(resolvedDealerId, updates);
  }

  for (const dealerId of dealerChanges.deactivations || []) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (isTempDealerId(resolvedDealerId)) continue;
    await deactivateDealerAction(resolvedDealerId);
  }

  for (const dealerId of dealerChanges.hardDeletes || []) {
    const resolvedDealerId = tempIdMap.get(String(dealerId)) ?? dealerId;
    if (isTempDealerId(resolvedDealerId)) continue;
    await hardDeleteDealerAction(resolvedDealerId);
  }
}
