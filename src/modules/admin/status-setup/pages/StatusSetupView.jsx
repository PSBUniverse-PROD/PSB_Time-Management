"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  isSameId,
  compareText,
  normalizeText,
  mapStatusRow,
  removeObjectKey,
  mergeUpdatePatch,
  appendUniqueId,
  EMPTY_DIALOG,
  TEMP_STATUS_PREFIX,
  createTempId,
  isTempStatusId,
  createEmptyStatusChanges,
  executeBatchSave,
} from "../data/statusSetup.data.js";

// ─── HOOK: useStatusSetup ──────────────────────────────────

function useStatusSetup({ statuses = [] }) {
  const router = useRouter();

  const seedStatuses = useMemo(
    () =>
      (Array.isArray(statuses) ? statuses : [])
        .map((status, index) => mapStatusRow(status, index))
        .sort((left, right) => compareText(left.sts_name, right.sts_name)),
    [statuses],
  );

  const [orderedStatuses, setOrderedStatuses] = useState(seedStatuses);
  const [statusChanges, setStatusChanges] = useState(createEmptyStatusChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [statusDraft, setStatusDraft] = useState({ name: "", desc: "" });
  const [editingStatusId, setEditingStatusId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedStatuses(seedStatuses);
    setStatusChanges(createEmptyStatusChanges());
    setDialog(EMPTY_DIALOG);
    setStatusDraft({ name: "", desc: "" });
    setIsMutatingAction(false);
    setIsSavingBatch(false);
    setEditingStatusId(null);
  }, [seedStatuses]);

  // -- computed
  const pendingSummary = useMemo(() => {
    const added = statusChanges.creates.length;
    const edited = Object.keys(statusChanges.updates || {}).length;
    const deactivated = statusChanges.deactivations.length;
    const hardDeleted = (statusChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [statusChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedStatusIds = useMemo(
    () => new Set((statusChanges.deactivations || []).map((id) => String(id ?? ""))),
    [statusChanges.deactivations],
  );

  const pendingHardDeletedStatusIds = useMemo(
    () => new Set((statusChanges.hardDeletes || []).map((id) => String(id ?? ""))),
    [statusChanges.hardDeletes],
  );

  const decoratedStatuses = useMemo(() => {
    const createdIds = new Set((statusChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = statusChanges.updates || {};
    const deactivatedIds = new Set((statusChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((statusChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedStatuses.map((row) => {
      const id = String(row?.status_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };

      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        const hasOtherFields = Object.keys(updates).some((k) => k !== "is_active");
        if (hasIsActive && !hasOtherFields) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        if (hasIsActive && hasOtherFields) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [statusChanges.creates, statusChanges.deactivations, statusChanges.hardDeletes, statusChanges.updates, orderedStatuses]);

  // -- dialog actions
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddStatusDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setStatusDraft({ name: "", desc: "" });
    setDialog({ kind: "add-status", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditStatusDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setStatusDraft({
      name: String(row?.sts_name || ""),
      desc: String(row?.sts_desc === "--" ? "" : (row?.sts_desc || "")),
    });
    setDialog({ kind: "edit-status", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleStatusDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const statusId = String(row?.status_id ?? "");
    if (pendingDeactivatedStatusIds.has(statusId)) {
      setStatusChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, statusId)),
      }));
      toastSuccess("Status deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-status", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedStatusIds]);

  const openDeactivateStatusDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-status", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteStatus = useCallback((row) => {
    const statusId = String(row?.status_id ?? "");
    if (!statusId || isMutatingAction || isSavingBatch) return;

    if (isTempStatusId(statusId)) {
      setOrderedStatuses((prev) => prev.filter((s) => !isSameId(s?.status_id, statusId)));
      setStatusChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, statusId)),
        updates: removeObjectKey(prev.updates, statusId),
      }));
      toastSuccess("Staged status removed.", "Batching");
      return;
    }

    setStatusChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, statusId)),
      updates: removeObjectKey(prev.updates, String(statusId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], statusId),
    }));
    toastSuccess("Status deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteStatus = useCallback((row) => {
    const statusId = String(row?.status_id ?? "");
    if (!statusId || isMutatingAction || isSavingBatch) return;
    setStatusChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, statusId)),
    }));
    toastSuccess("Status deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  // -- batch actions
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedStatuses(seedStatuses);
    setStatusChanges(createEmptyStatusChanges());
    setDialog(EMPTY_DIALOG);
    setStatusDraft({ name: "", desc: "" });
    setEditingStatusId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedStatuses]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeBatchSave(statusChanges);
      setStatusChanges(createEmptyStatusChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
      setEditingStatusId(null);
    }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router, statusChanges]);

  // -- submit handlers
  const submitAddStatus = useCallback(() => {
    const statusName = normalizeText(statusDraft.name);
    if (!statusName) { toastError("Status name is required."); return; }
    const tempStatusId = createTempId(TEMP_STATUS_PREFIX);
    const statusDesc = normalizeText(statusDraft.desc);
    setOrderedStatuses((prev) => [
      ...prev,
      mapStatusRow({ status_id: tempStatusId, sts_name: statusName, sts_desc: statusDesc || null, is_active: true }, prev.length),
    ]);
    setStatusChanges((prev) => ({
      ...prev,
      creates: [...prev.creates, { tempId: tempStatusId, payload: { sts_name: statusName, sts_desc: statusDesc || null, is_active: true } }],
    }));
    setDialog(EMPTY_DIALOG);
    setStatusDraft({ name: "", desc: "" });
    toastSuccess("Status staged for Save Batch.", "Batching");
  }, [statusDraft.desc, statusDraft.name]);

  const submitEditStatus = useCallback(() => {
    const row = dialog?.target;
    if (!row?.status_id) { toastError("Invalid status."); return; }
    const statusName = normalizeText(statusDraft.name);
    if (!statusName) { toastError("Status name is required."); return; }
    const statusDesc = normalizeText(statusDraft.desc);
    const statusId = row.status_id;
    setOrderedStatuses((prev) =>
      prev.map((status, index) => {
        if (!isSameId(status?.status_id, statusId)) return status;
        return mapStatusRow({ ...status, sts_name: statusName, sts_desc: statusDesc || null }, index);
      }),
    );
    setStatusChanges((prev) => {
      if (isTempStatusId(statusId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, statusId)) return entry;
            return { ...entry, payload: { ...entry.payload, sts_name: statusName, sts_desc: statusDesc || null } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(statusId)]: mergeUpdatePatch(prev.updates?.[String(statusId)], { sts_name: statusName, sts_desc: statusDesc || null }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setStatusDraft({ name: "", desc: "" });
    toastSuccess("Status edit staged for Save Batch.", "Batching");
  }, [dialog?.target, statusDraft.desc, statusDraft.name]);

  const submitToggleStatus = useCallback(() => {
    const row = dialog?.target;
    if (!row?.status_id) { toastError("Invalid status."); return; }
    const statusId = row.status_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedStatuses((prev) =>
      prev.map((status, index) => {
        if (!isSameId(status?.status_id, statusId)) return status;
        return mapStatusRow({ ...status, is_active: nextIsActive }, index);
      }),
    );
    setStatusChanges((prev) => {
      if (isTempStatusId(statusId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, statusId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(statusId)]: mergeUpdatePatch(prev.updates?.[String(statusId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Status enabled — staged for Save Batch." : "Status disabled — staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivateStatus = useCallback(() => {
    const row = dialog?.target;
    if (!row?.status_id) { toastError("Invalid status."); return; }
    const statusId = row.status_id;
    if (isTempStatusId(statusId)) {
      setOrderedStatuses((prev) => prev.filter((status) => !isSameId(status?.status_id, statusId)));
      setStatusChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, statusId)),
        updates: removeObjectKey(prev.updates, String(statusId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged status removed.", "Batching");
      return;
    }
    setStatusChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, statusId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Status deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  // -- row editing
  const startEditingStatus = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.status_id ?? "");
    setEditingStatusId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSavingBatch]);

  const stopEditingStatus = useCallback(() => { setEditingStatusId(null); }, []);

  // -- inline edit
  const handleInlineEdit = useCallback((row, key, value) => {
    const statusId = row?.status_id;
    if (!statusId || isMutatingAction || isSavingBatch) return;
    setOrderedStatuses((prev) =>
      prev.map((status, index) => {
        if (!isSameId(status?.status_id, statusId)) return status;
        return mapStatusRow({ ...status, [key]: value || null }, index);
      }),
    );
    setStatusChanges((prev) => {
      if (isTempStatusId(statusId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, statusId)) return entry;
            return { ...entry, payload: { ...entry.payload, [key]: value || null } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(statusId)]: mergeUpdatePatch(prev.updates?.[String(statusId)], { [key]: value || null }),
        },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedStatuses, dialog, statusDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedStatusIds, pendingHardDeletedStatusIds,
    setDialog, setStatusDraft, closeDialog, openAddStatusDialog, openEditStatusDialog,
    openToggleStatusDialog, openDeactivateStatusDialog, stageHardDeleteStatus, unstageHardDeleteStatus,
    handleCancelBatch, handleSaveBatch, submitAddStatus, submitEditStatus,
    submitToggleStatus, submitDeactivateStatus, editingStatusId, startEditingStatus,
    stopEditingStatus, handleInlineEdit,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────



function StatusHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddStatusDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Status Setup</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddStatusDialog}>
          Add Status
        </Button>
      </div>
    </div>
  );
}

function StatusTable({ decoratedStatuses, isMutatingAction, isSavingBatch, pendingDeactivatedStatusIds, editingStatusId, onStartEditing, onStopEditing, onInlineEdit, openToggleStatusDialog, openDeactivateStatusDialog, stageHardDeleteStatus, onUndoBatchAction }) {
  const columns = useMemo(
    () => [
      {
        key: "sts_name", label: "Status Name", width: "30%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          const isEditing = String(row?.status_id ?? "") === String(editingStatusId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              <InlineEditCell value={row?.sts_name || ""} onCommit={(val) => onInlineEdit?.(row, "sts_name", val)} onCancel={onStopEditing} disabled={editDisabled} />
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      {
        key: "sts_desc", label: "Description", width: "48%", sortable: true,
        render: (row) => {
          const isEditing = String(row?.status_id ?? "") === String(editingStatusId ?? "");
          const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
          return <InlineEditCell value={row?.sts_desc === "--" ? "" : (row?.sts_desc || "")} onCommit={(val) => onInlineEdit?.(row, "sts_desc", val)} onCancel={onStopEditing} disabled={editDisabled} />;
        },
      },
      {
        key: "is_active_bool", label: "Active", width: "22%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [editingStatusId, isMutatingAction, isSavingBatch, onInlineEdit, onStopEditing],
  );

  const actions = useMemo(
    () => [
      { key: "edit-status", label: "Edit", type: "secondary", icon: "pen", visible: (row) => String(row?.status_id ?? "") !== String(editingStatusId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => onStartEditing(row) },
      { key: "cancel-edit-status", label: "Cancel", type: "secondary", icon: "xmark", visible: (row) => String(row?.status_id ?? "") === String(editingStatusId ?? ""), onClick: () => onStopEditing() },
      { key: "restore-status", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => (!Boolean(row?.is_active_bool) || pendingDeactivatedStatusIds.has(String(row?.status_id ?? ""))) && String(row?.status_id ?? "") !== String(editingStatusId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleStatusDialog(row) },
      { key: "deactivate-status", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedStatusIds.has(String(row?.status_id ?? "")) && String(row?.status_id ?? "") !== String(editingStatusId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateStatusDialog(row) },
      { key: "delete-status", label: "Delete", type: "danger", icon: "trash", visible: (row) => String(row?.status_id ?? "") !== String(editingStatusId ?? ""), confirm: true, confirmMessage: (row) => `Permanently delete ${row?.status_name || "this status"}? This action cannot be undone.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteStatus(row) },
    ],
    [editingStatusId, isMutatingAction, isSavingBatch, onStartEditing, onStopEditing, openDeactivateStatusDialog, openToggleStatusDialog, pendingDeactivatedStatusIds, stageHardDeleteStatus],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Statuses" subtitle="System-wide status records.">
          <TableZ columns={columns} data={decoratedStatuses} rowIdKey="status_id" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No statuses found." />
        </Card>
      </div>
    </div>
  );
}

function StatusDialog({ dialog, statusDraft, isMutatingAction, isSavingBatch, setStatusDraft, closeDialog, submitAddStatus, submitEditStatus, submitToggleStatus, submitDeactivateStatus }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-status") return "Add Status";
    if (kind === "edit-status") return "Edit Status";
    if (kind === "toggle-status") return dialog?.nextIsActive ? "Enable Status" : "Disable Status";
    if (kind === "deactivate-status") return "Deactivate Status";
    return "Status";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add-status" || dialog.kind === "edit-status") ? (
        <div>
          <div className="mb-3">
            <Input label="Status Name" value={statusDraft.name} onChange={(e) => setStatusDraft((prev) => ({ ...prev, name: e.target.value }))} placeholder="Enter status name" disabled={isBusy} />
          </div>
          <div className="mb-3">
            <Input label="Description" value={statusDraft.desc} onChange={(e) => setStatusDraft((prev) => ({ ...prev, desc: e.target.value }))} placeholder="Enter description (optional)" disabled={isBusy} />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-status" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add-status" ? submitAddStatus : submitEditStatus}>
              {dialog.kind === "add-status" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-status" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable status "${dialog.target?.sts_name || "--"}"?` : `Disable status "${dialog.target?.sts_name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleStatus}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-status" ? (
        <div>
          <p className="mb-3">Deactivate status <strong>&quot;{dialog.target?.sts_name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateStatus}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function StatusSetupView({ statuses }) {
  const hook = useStatusSetup({ statuses });

  return (
    <main className="container py-4">
      <StatusHeader
        hasPendingChanges={hook.hasPendingChanges}
        pendingSummary={hook.pendingSummary}
        isSavingBatch={hook.isSavingBatch}
        isMutatingAction={hook.isMutatingAction}
        handleSaveBatch={hook.handleSaveBatch}
        handleCancelBatch={hook.handleCancelBatch}
        openAddStatusDialog={hook.openAddStatusDialog}
      />
      <StatusTable
        decoratedStatuses={hook.decoratedStatuses}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        pendingDeactivatedStatusIds={hook.pendingDeactivatedStatusIds}
        editingStatusId={hook.editingStatusId}
        onStartEditing={hook.startEditingStatus}
        onStopEditing={hook.stopEditingStatus}
        onInlineEdit={hook.handleInlineEdit}
        openToggleStatusDialog={hook.openToggleStatusDialog}
        openDeactivateStatusDialog={hook.openDeactivateStatusDialog}
        stageHardDeleteStatus={hook.stageHardDeleteStatus}
        onUndoBatchAction={hook.unstageHardDeleteStatus}
      />
      <StatusDialog
        dialog={hook.dialog}
        statusDraft={hook.statusDraft}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        setStatusDraft={hook.setStatusDraft}
        closeDialog={hook.closeDialog}
        submitAddStatus={hook.submitAddStatus}
        submitEditStatus={hook.submitEditStatus}
        submitToggleStatus={hook.submitToggleStatus}
        submitDeactivateStatus={hook.submitDeactivateStatus}
      />
    </main>
  );
}
