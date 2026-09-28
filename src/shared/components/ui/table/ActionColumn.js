"use client";

import { useMemo, useState } from "react";
import Button from "@/shared/components/ui/controls/Button";
import Modal from "@/shared/components/ui/overlay/Modal";
import AppIcon from "@/shared/components/ui/AppIcon";

import { normalizeBatchState, BATCH_STATE_HARD_DELETED } from "@/shared/components/ui/table/tableUtils";

function normalizeActionType(value) {
  const raw = String(value || "secondary").trim().toLowerCase();

  if (raw === "primary") return "primary";
  if (raw === "danger") return "danger";
  return "secondary";
}

/**
 * Maps icon names to per-action color CSS classes.
 * Allowed actions: View, Edit, Save, Deactivate, Delete, Cancel, Restore.
 */
const ACTION_COLOR_MAP = Object.freeze({
  // View (gray)
  eye: "action-color-view",
  preview: "action-color-view",
  // Edit (blue)
  pen: "action-color-edit",
  edit: "action-color-edit",
  // Save (green)
  save: "action-color-save",
  "floppy-disk": "action-color-save",
  // Deactivate (amber)
  ban: "action-color-deactivate",
  deactivate: "action-color-deactivate",
  // Delete (red)
  trash: "action-color-delete",
  delete: "action-color-delete",
  // Cancel (gray)
  xmark: "action-color-cancel",
  cancel: "action-color-cancel",
  // Restore (green secondary)
  "rotate-left": "action-color-restore",
  restore: "action-color-restore",
});

function resolveActionColorClass(iconName) {
  const key = String(iconName || "").trim().toLowerCase();
  return ACTION_COLOR_MAP[key] || "action-color-edit";
}

/**
 * Explicit action ordering by icon name.
 * View → Edit → Save → Deactivate → Cancel → Restore → Delete.
 */
const ACTION_ICON_ORDER = Object.freeze({
  eye: 1, preview: 1,
  pen: 2, edit: 2,
  xmark: 2, cancel: 2,
  save: 3, "floppy-disk": 3,
  ban: 3, deactivate: 3,
  "rotate-left": 3, restore: 3,
  trash: 4, delete: 4,
});

function resolveIconOrder(iconName) {
  const key = String(iconName || "").trim().toLowerCase();
  return ACTION_ICON_ORDER[key] || 5;
}

/**
 * Detects whether a row is in a "pending removal" batch state.
 * Only hardDeleted and __pendingRemove trigger this — deactivated/soft-deleted
 * rows keep their normal actions (Restore, Edit, etc.).
 */
function isRowPendingRemoval(row) {
  if (Boolean(row?.__pendingRemove)) return true;
  const state = normalizeBatchState(row?.__batchState);
  return state === BATCH_STATE_HARD_DELETED;
}

function resolveVisibleActions(actions, row) {
  return actions
    .filter((action) => {
      if (!action || typeof action !== "object") {
        return false;
      }

      if (typeof action.visible !== "function") {
        return true;
      }

      try {
        return action.visible(row) !== false;
      } catch {
        return false;
      }
    })
    .map((action) => ({
      ...action,
      type: normalizeActionType(action.type),
    }))
    .sort((left, right) => {
      const leftOrder = resolveIconOrder(left.icon);
      const rightOrder = resolveIconOrder(right.icon);
      return leftOrder - rightOrder;
    });
}

function isDisabled(action, row) {
  if (typeof action.disabled === "function") {
    try {
      return action.disabled(row) === true;
    } catch {
      return true;
    }
  }

  return action.disabled === true;
}

function requiresConfirmation(action) {
  const actionType = normalizeActionType(action.type);
  return actionType === "danger" || action.confirm === true;
}

function resolveConfirmationMessage(action, row) {
  const label = String(action.label || "this action").trim();
  const fallbackMessage = `Confirm ${label}?`;

  const customMessage =
    typeof action.confirmMessage === "function"
      ? action.confirmMessage(row, action)
      : action.confirmMessage;

  return String(customMessage || fallbackMessage).trim() || fallbackMessage;
}

export default function ActionColumn({ row, actions = [], onAction, onUndoBatchAction }) {
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  const pendingRemoval = isRowPendingRemoval(row);

  const visibleActions = useMemo(
    () => pendingRemoval ? [] : resolveVisibleActions(Array.isArray(actions) ? actions : [], row),
    [actions, row, pendingRemoval],
  );

  const emitActionDirectly = (action) => {
    if (typeof onAction === "function") {
      onAction({ action, row });
    }
  };

  const emitAction = (action) => {
    if (!action || isDisabled(action, row)) {
      return;
    }

    if (requiresConfirmation(action)) {
      setPendingConfirmation({
        action,
        message: resolveConfirmationMessage(action, row),
      });
      return;
    }

    emitActionDirectly(action);
  };

  const closeConfirmation = () => {
    setPendingConfirmation(null);
  };

  const confirmPendingAction = () => {
    const action = pendingConfirmation?.action;
    setPendingConfirmation(null);

    if (!action || isDisabled(action, row)) {
      return;
    }

    emitActionDirectly(action);
  };

  if (pendingRemoval && typeof onUndoBatchAction === "function") {
    return (
      <div className="psb-ui-table-actions-stack">
        <button
          type="button"
          className="table-actions-icon-btn action-color-restore"
          onClick={() => onUndoBatchAction(row)}
          title="Undo Delete"
          aria-label="Undo Delete"
        >
          <AppIcon icon="rotate-left" />
        </button>
      </div>
    );
  }

  if (visibleActions.length === 0) {
    return null;
  }

  const confirmAction = pendingConfirmation?.action || null;
  const confirmActionType = normalizeActionType(confirmAction?.type);
  const confirmButtonVariant = confirmActionType === "danger" ? "danger" : "primary";
  const confirmButtonLabel = String(confirmAction?.label || "Confirm").trim() || "Confirm";

  return (
    <>
      <div className="psb-ui-table-actions-stack">
        {visibleActions.map((action) => {
          const label = String(action.label || "").trim();
          const iconName = String(action.icon || "").trim();

          return (
            <button
              key={String(action.key || action.label)}
              type="button"
              className={`table-actions-icon-btn ${resolveActionColorClass(iconName)}`}
              disabled={isDisabled(action, row)}
              onClick={() => emitAction(action)}
              title={label || undefined}
              aria-label={label || undefined}
            >
              {iconName ? <AppIcon icon={iconName} /> : <span className="visually-hidden">{label}</span>}
            </button>
          );
        })}
      </div>

      <Modal
        show={Boolean(pendingConfirmation)}
        onHide={closeConfirmation}
        title="Confirm Action"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={closeConfirmation}>
              Cancel
            </Button>
            <Button type="button" variant={confirmButtonVariant} onClick={confirmPendingAction}>
              {confirmButtonLabel}
            </Button>
          </>
        )}
      >
        <p className="mb-0">{pendingConfirmation?.message || "Are you sure you want to continue?"}</p>
      </Modal>
    </>
  );
}
