"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TOAST_EVENT, TOAST_TYPES } from "@/shared/utils/toast";

let nextToastId = 1;
const MAX_VISIBLE_TOASTS = 4;

const TOAST_META = {
  [TOAST_TYPES.success]: { icon: "✓", title: "Success" },
  [TOAST_TYPES.warning]: { icon: "!", title: "Warning" },
  [TOAST_TYPES.error]: { icon: "!", title: "Error" },
  [TOAST_TYPES.info]: { icon: "i", title: "Information" },
};

function normalizeToastPayload(payload) {
  const type = String(payload?.type || TOAST_TYPES.info).toLowerCase();

  return {
    id: nextToastId++,
    type:
      type === TOAST_TYPES.success ||
      type === TOAST_TYPES.warning ||
      type === TOAST_TYPES.error
        ? type
        : TOAST_TYPES.info,
    title: String(payload?.title || "").trim(),
    message: String(payload?.message || "").trim(),
    durationMs:
      Number.isFinite(Number(payload?.durationMs)) && Number(payload.durationMs) >= 0
        ? Number(payload.durationMs)
        : 4000,
    createdAt: Date.now(),
  };
}

export default function GlobalToastHost() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const clearToastTimer = useCallback((id) => {
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    clearToastTimer(id);
  }, [clearToastTimer]);

  const scheduleToastTimer = useCallback((toast) => {
    clearToastTimer(toast.id);

    if (toast.durationMs <= 0) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== toast.id));
      clearToastTimer(toast.id);
    }, toast.durationMs);

    timersRef.current.set(toast.id, timerId);
  }, [clearToastTimer]);

  useEffect(() => {
    const timers = timersRef.current;

    function handleToastEvent(event) {
      const toast = normalizeToastPayload(event?.detail);
      if (!toast.message) return;

      setToasts((previous) => {
        const next = [toast, ...previous];
        const removed = next.slice(MAX_VISIBLE_TOASTS);
        removed.forEach((item) => clearToastTimer(item.id));
        return next.slice(0, MAX_VISIBLE_TOASTS);
      });

      scheduleToastTimer(toast);
    }

    window.addEventListener(TOAST_EVENT, handleToastEvent);

    return () => {
      window.removeEventListener(TOAST_EVENT, handleToastEvent);
      timers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      timers.clear();
    };
  }, [clearToastTimer, scheduleToastTimer]);

  if (toasts.length === 0) return null;

  return (
    <div
      className="global-toast-layer"
      aria-live="polite"
      aria-atomic="false"
      style={{ "--toast-count": toasts.length }}
    >
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={`global-toast-item global-toast-${toast.type}${index === 0 ? " is-latest" : ""}`}
          role={toast.type === TOAST_TYPES.error ? "alert" : "status"}
          style={{
            "--toast-index": index,
            zIndex: MAX_VISIBLE_TOASTS - index,
          }}
        >
          <div className="global-toast-inner">
            <span className={`global-toast-icon global-toast-icon-${toast.type}`} aria-hidden="true">
              {TOAST_META[toast.type]?.icon || TOAST_META[TOAST_TYPES.info].icon}
            </span>
            <div className="global-toast-message-wrap">
              <p className="global-toast-title mb-0">
                {toast.title || TOAST_META[toast.type]?.title || TOAST_META[TOAST_TYPES.info].title}
              </p>
              <p className="global-toast-message mb-0">{toast.message}</p>
            </div>
            <button
              type="button"
              className="global-toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
