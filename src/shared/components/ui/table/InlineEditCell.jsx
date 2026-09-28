"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function InlineEditCell({
  value,
  onCommit,
  onCancel,
  disabled = false,
  placeholder = "--",
  type = "text",
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [prevValue, setPrevValue] = useState(value);
  const inputRef = useRef(null);
  const prevDisabledRef = useRef(disabled);

  // Sync draft when value changes externally (e.g. after save).
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(String(value ?? ""));
  }

  // Auto-focus the first input in the row when transitioning from disabled→enabled.
  useEffect(() => {
    if (prevDisabledRef.current && !disabled && inputRef.current) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
    prevDisabledRef.current = disabled;
  }, [disabled]);

  const handleCommit = useCallback(() => {
    const trimmed = String(draft ?? "").trim();
    const original = String(value ?? "").trim();
    if (trimmed !== original) {
      onCommit?.(trimmed);
    }
  }, [draft, onCommit, value]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleCommit();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDraft(String(value ?? ""));
        onCancel?.();
      }
    },
    [handleCommit, onCancel, value],
  );

  if (!disabled) {
    return (
      <input
        ref={inputRef}
        className="form-control form-control-sm psb-inline-edit-input"
        type={type}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  const displayValue = String(value ?? "").trim() || placeholder;

  return (
    <span className="psb-inline-edit-cell">
      {displayValue}
    </span>
  );
}
