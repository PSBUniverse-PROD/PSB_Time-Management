/**
 * Dealer module error reporting (client-safe).
 *
 * Errors the user can fix themselves (a taken username, a wrong code) show as
 * a short toast. Anything unexpected opens the error window (DealerErrorHost)
 * with details the user can copy or email to support.
 */

import { toastError } from "@/shared/utils/toast";

export const DEALER_ERROR_EVENT = "psb:dealer-error";

/**
 * Turns a failed action result ({ success: false, error, unexpected }) into an
 * Error. A result without any error text counts as unexpected.
 */
export function errorFromResult(result, fallback) {
  const error = new Error(result?.error || fallback);
  error.unexpected = Boolean(result?.unexpected) || !result?.error;
  return error;
}

/**
 * Shows an error from the dealer module. `error.unexpected === false` means the
 * user can fix it (toast); anything else, including lost connections, opens the
 * error window.
 */
export function showDealerError(error, { title = "Error", action = "" } = {}) {
  const message = String(error?.message || "").trim() || "Something went wrong.";
  if (error?.unexpected === false) {
    toastError(message, title);
    return;
  }
  if (typeof window === "undefined") return;

  const details = [
    `What you were doing: ${action || title}`,
    `Page: ${window.location.pathname}${window.location.hash}`,
    `Time: ${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} (Central Time)`,
    `Error: ${message}`,
  ].join("\n");
  window.dispatchEvent(new CustomEvent(DEALER_ERROR_EVENT, { detail: { title, message, details } }));
}
