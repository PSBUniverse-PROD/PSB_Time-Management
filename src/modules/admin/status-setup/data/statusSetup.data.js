/**
 * Status Setup — Data Layer (client-safe utilities)
 *
 * Pure helpers shared between page and view:
 * - Model helpers (normalization, display)
 * - Utility functions
 * - Batch save orchestration (via Server Actions)
 */

import { saveStatusBatch } from "./statusSetup.actions.js";

// ─── MODEL HELPERS ─────────────────────────────────────────

export function isStatusActive(status) {
  if (status?.is_active === false || status?.is_active === 0) return false;
  const text = String(status?.is_active ?? "").trim().toLowerCase();
  return !(text === "false" || text === "0" || text === "f" || text === "n" || text === "no");
}

export function getStatusDisplayName(status) {
  return status?.sts_name || status?.status_name || status?.name || "Unknown";
}

export function getStatusDescription(status) {
  return status?.sts_desc || status?.status_desc || status?.description || "--";
}

export function mapStatusRow(status, index) {
  return {
    ...status,
    id: status?.status_id ?? `status-${index}`,
    sts_name: getStatusDisplayName(status),
    sts_desc: getStatusDescription(status),
    is_active_bool: isStatusActive(status),
  };
}

// ─── UTILITY HELPERS ───────────────────────────────────────

export function isSameId(left, right) {
  return String(left ?? "") === String(right ?? "");
}

export function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

export function normalizeText(value) {
  return String(value ?? "").trim();
}

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

export function mergeUpdatePatch(previousPatch, nextPatch) {
  const mergedPatch = { ...(previousPatch || {}) };
  Object.entries(nextPatch || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      mergedPatch[key] = value;
    }
  });
  return mergedPatch;
}

export function appendUniqueId(idList, value) {
  const normalizedValue = String(value ?? "");
  if (!normalizedValue) return Array.isArray(idList) ? [...idList] : [];
  const existing = Array.isArray(idList) ? idList : [];
  if (existing.some((entry) => isSameId(entry, normalizedValue))) return [...existing];
  return [...existing, normalizedValue];
}

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
export const TEMP_STATUS_PREFIX = "tmp-status-";

export function createTempId(prefix) {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isTempStatusId(value) {
  return String(value ?? "").startsWith(TEMP_STATUS_PREFIX);
}

export function createEmptyStatusChanges() {
  return { creates: [], updates: {}, deactivations: [], hardDeletes: [] };
}

// ─── BATCH SAVE (calls Server Actions) ─────────────────────

// The whole batch is saved in one server call (saveStatusBatch); it used to be
// one call per change.
export async function executeBatchSave(statusChanges) {
  await saveStatusBatch(statusChanges);
}
