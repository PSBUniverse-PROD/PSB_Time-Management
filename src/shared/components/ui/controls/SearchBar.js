"use client";

import { useEffect, useRef } from "react";
import Input from "@/shared/components/ui/controls/Input";

const DEFAULT_DEBOUNCE_MS = 350;

function toDelay(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_DEBOUNCE_MS;
  }

  return Math.trunc(parsed);
}

export default function SearchBar({
  value = "",
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onDebouncedChange,
  className = "",
  ...props
}) {
  const normalizedValue = String(value || "");
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== normalizedValue) {
      inputRef.current.value = normalizedValue;
    }
  }, [normalizedValue]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleChange = (event) => {
    const nextValue = String(event.target.value || "");

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      if (typeof onDebouncedChange === "function") {
        onDebouncedChange(nextValue);
      }
    }, toDelay(debounceMs));
  };

  return (
    <Input
      ref={inputRef}
      type="search"
      defaultValue={normalizedValue}
      className={["psb-ui-searchbar", className].filter(Boolean).join(" ")}
      onChange={handleChange}
      {...props}
    />
  );
}