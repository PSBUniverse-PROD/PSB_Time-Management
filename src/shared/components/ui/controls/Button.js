"use client";

import { Button as BootstrapButton, Spinner } from "react-bootstrap";

const ALLOWED_VARIANTS = new Set([
  "primary", "secondary", "danger", "success", "warning", "restore", "ghost",
  "outline-primary", "outline-secondary", "outline-danger", "outline-success",
]);

function normalizeVariant(variant) {
  const raw = String(variant || "primary").trim().toLowerCase();

  if (ALLOWED_VARIANTS.has(raw)) {
    return raw;
  }

  return "primary";
}

export default function Button({
  className = "",
  variant = "primary",
  loading = false,
  disabled = false,
  children,
  ...props
}) {
  const normalizedVariant = normalizeVariant(variant);
  const isOutline = normalizedVariant.startsWith("outline-");
  const variantClassMap = { ghost: "light", success: "primary", warning: "primary", restore: "primary" };
  const bootstrapVariant = isOutline
    ? normalizedVariant
    : (variantClassMap[normalizedVariant] || normalizedVariant);
  const mergedClassName = [
    "psb-ui-button",
    normalizedVariant === "ghost" ? "psb-ui-button-ghost" : "",
    normalizedVariant === "success" ? "psb-ui-button-success" : "",
    normalizedVariant === "warning" ? "psb-ui-button-warning" : "",
    normalizedVariant === "restore" ? "psb-ui-button-restore" : "",
    isOutline ? "psb-ui-button-outline" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isDisabled = disabled || loading;

  return (
    <BootstrapButton variant={bootstrapVariant} disabled={isDisabled} className={mergedClassName} {...props}>
      {loading ? <Spinner size="sm" animation="border" role="status" className="me-2" /> : null}
      {children}
    </BootstrapButton>
  );
}
