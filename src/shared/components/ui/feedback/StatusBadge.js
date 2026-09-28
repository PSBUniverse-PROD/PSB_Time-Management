"use client";

/**
 * Unified status badge component.
 * Renders a pill-shaped badge with token-driven colors.
 *
 * Supported statuses: active, inactive, pending, processing,
 * completed, failed, cancelled, archived, draft, suspended.
 *
 * @param {{ status: string, label?: string, className?: string }} props
 *   - status: semantic status key (case-insensitive)
 *   - label: override display text (defaults to capitalized status)
 *   - className: additional CSS classes
 */
export default function StatusBadge({ status, label, className = "" }) {
  const key = String(status || "").trim().toLowerCase();
  if (!key) return null;

  const displayLabel = label || key.charAt(0).toUpperCase() + key.slice(1);
  const statusClass = STATUS_CLASSES[key] || "psb-status-inactive";

  const mergedClassName = [
    "psb-status-badge",
    statusClass,
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={mergedClassName}>
      <span className="psb-status-dot" aria-hidden="true" />
      {displayLabel}
    </span>
  );
}

const STATUS_CLASSES = Object.freeze({
  active: "psb-status-active",
  completed: "psb-status-completed",
  success: "psb-status-completed",
  approved: "psb-status-completed",
  processing: "psb-status-processing",
  "in-progress": "psb-status-processing",
  pending: "psb-status-pending",
  waiting: "psb-status-pending",
  suspended: "psb-status-suspended",
  failed: "psb-status-failed",
  error: "psb-status-failed",
  rejected: "psb-status-failed",
  inactive: "psb-status-inactive",
  disabled: "psb-status-inactive",
  cancelled: "psb-status-cancelled",
  canceled: "psb-status-cancelled",
  archived: "psb-status-archived",
  draft: "psb-status-draft",
});
