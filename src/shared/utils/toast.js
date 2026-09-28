export const TOAST_EVENT = "psb:toast";

export const TOAST_TYPES = {
  success: "success",
  warning: "warning",
  error: "error",
  info: "info",
};

function normalizeType(type) {
  const value = String(type || "info").toLowerCase();
  if (value === TOAST_TYPES.success) return TOAST_TYPES.success;
  if (value === TOAST_TYPES.warning) return TOAST_TYPES.warning;
  if (value === TOAST_TYPES.error) return TOAST_TYPES.error;
  return TOAST_TYPES.info;
}

export function showToast(config = {}) {
  if (typeof window === "undefined") return;

  const message = String(config.message || "").trim();
  if (!message) return;

  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: {
        type: normalizeType(config.type),
        title: String(config.title || "").trim(),
        message,
        durationMs:
          Number.isFinite(Number(config.durationMs)) && Number(config.durationMs) >= 0
            ? Number(config.durationMs)
            : 4000,
      },
    })
  );
}

export function toastSuccess(message, title = "Success", options = {}) {
  showToast({ ...options, type: TOAST_TYPES.success, title, message });
}

export function toastWarning(message, title = "Warning", options = {}) {
  showToast({ ...options, type: TOAST_TYPES.warning, title, message });
}

export function toastError(message, title = "Error", options = {}) {
  showToast({ ...options, type: TOAST_TYPES.error, title, message });
}

export function toastInfo(message, title = "Information", options = {}) {
  showToast({ ...options, type: TOAST_TYPES.info, title, message });
}
