/**
 * Dealer Master Setup — Data Layer (client-safe utilities)
 *
 * Pure helpers shared between page and view:
 * - Enrollment draft and password generator
 * - Model helpers (normalization, display)
 * - Utility functions
 */

// ─── ENROLLMENT ────────────────────────────────────────────

/** An empty Enroll Dealer form. The dealer code is assigned by the server. */
export function createEmptyEnrollDraft() {
  return { dealer_name: "", email: "", phone: "", username: "", password: "" };
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";

/** A random dealer password (browser only). Used by Enroll Dealer and the login modal. */
export function generateDealerPassword(length = 16) {
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join("");
}

// ─── MODEL HELPERS ─────────────────────────────────────────

/**
 * Reads the active flag defensively, so every falsy spelling
 * (false, 0, "false", "no", …) counts as inactive.
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

export const EMPTY_DIALOG = { kind: null, target: null, nextIsActive: null };
