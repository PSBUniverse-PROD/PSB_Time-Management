"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import WorkflowSideNav from "./WorkflowSideNav";
import {
  isSameId, compareText, normalizeText,
  removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_REF_PREFIX, createTempId, isTempRefId,
  createEmptyRefChanges, executeRefBatchSave, batchMarker,
} from "../data/reference.data.js";

// ─── HOOK: useMappingTable ─────────────────────────────────

function useMappingTable({ items = [], config }) {
  const router = useRouter();
  const {
    idField = "id",
    title = "Mapping",
    subtitle = "Manage mapping records.",
    addLabel = "Add Record",
    actions = null,
    selectColumns = [],
    booleanColumns = [],
  } = config || {};

  const seedRows = useMemo(
    () => (Array.isArray(items) ? items : [])
      .map((row, i) => ({ ...row, ref_id: row?.[idField] ?? `map-${i}`, is_active_bool: Boolean(row?.is_active) }))
      .sort((a, b) => compareText(String(a?.ref_id || ""), String(b?.ref_id || ""))),
    [items, idField],
  );

  const [orderedRows, setOrderedRows] = useState(seedRows);
  const [changes, setChanges] = useState(createEmptyRefChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [draft, setDraft] = useState({});
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedRows(seedRows);
    setChanges(createEmptyRefChanges());
    setDialog(EMPTY_DIALOG);
    setDraft({});
    setIsMutatingAction(false);
    setIsSavingBatch(false);
  }, [seedRows]);

  const pendingSummary = useMemo(() => {
    const added = changes.creates.length;
    const edited = Object.keys(changes.updates || {}).length;
    const deactivated = changes.deactivations.length;
    const hardDeleted = (changes.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [changes]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedIds = useMemo(
    () => new Set((changes.deactivations || []).map((id) => String(id ?? ""))),
    [changes.deactivations],
  );

  const decoratedRows = useMemo(() => {
    const createdIds = new Set((changes.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = changes.updates || {};
    const deactivatedIds = new Set((changes.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((changes.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedRows.map((row) => {
      const id = String(row?.ref_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };
      if (updatesMap[id]) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [changes.creates, changes.deactivations, changes.hardDeletes, changes.updates, orderedRows]);

  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    const initialDraft = {};
    selectColumns.forEach((col) => { initialDraft[col.field] = ""; });
    booleanColumns.forEach((col) => { initialDraft[col.field] = Boolean(col.defaultValue); });
    initialDraft.is_active = true;
    setDraft(initialDraft);
    setDialog({ kind: "add", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch, selectColumns, booleanColumns]);

  const openEditDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const draftValues = {};
    selectColumns.forEach((col) => { draftValues[col.field] = String(row?.[col.field] ?? ""); });
    booleanColumns.forEach((col) => { draftValues[col.field] = Boolean(row?.[col.field]); });
    draftValues.is_active = Boolean(row?.is_active);
    if (Object.prototype.hasOwnProperty.call(row || {}, "is_primary")) draftValues.is_primary = Boolean(row?.is_primary);
    setDraft(draftValues);
    setDialog({ kind: "edit", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch, selectColumns, booleanColumns]);

  const openToggleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const id = String(row?.ref_id ?? "");
    if (pendingDeactivatedIds.has(id)) {
      setChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((e) => !isSameId(e, id)),
      }));
      toastSuccess("Deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedIds]);

  const openDeactivateDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDelete = useCallback((row) => {
    const id = String(row?.ref_id ?? "");
    if (!id || isMutatingAction || isSavingBatch) return;

    if (isTempRefId(id)) {
      setOrderedRows((prev) => prev.filter((r) => !isSameId(r?.ref_id, id)));
      setChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, id)),
        updates: removeObjectKey(prev.updates, id),
      }));
      toastSuccess("Staged record removed.", "Batching");
      return;
    }

    setChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((e) => !isSameId(e, id)),
      updates: removeObjectKey(prev.updates, String(id)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], id),
    }));
    toastSuccess("Deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDelete = useCallback((row) => {
    const id = String(row?.ref_id ?? "");
    if (!id || isMutatingAction || isSavingBatch) return;
    setChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((e) => !isSameId(e, id)),
    }));
    toastSuccess("Deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedRows(seedRows);
    setChanges(createEmptyRefChanges());
    setDialog(EMPTY_DIALOG);
    setDraft({});
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedRows]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeRefBatchSave(changes, actions);
      setChanges(createEmptyRefChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
    }
  }, [actions, changes, hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router]);

  const submitAdd = useCallback(() => {
    const missingField = selectColumns.find((col) => {
      const val = normalizeText(draft[col.field]);
      return col.required !== false && !val;
    });
    if (missingField) { toastError(`${missingField.label} is required.`); return; }

    const payload = {};
    selectColumns.forEach((col) => {
      const val = normalizeText(draft[col.field]);
      payload[col.field] = val === "" ? null : val;
    });
    booleanColumns.forEach((col) => { payload[col.field] = Boolean(draft[col.field]); });
    payload.is_active = Boolean(draft.is_active);
    if (Object.prototype.hasOwnProperty.call(draft || {}, "is_primary")) payload.is_primary = Boolean(draft.is_primary);

    const tempId = createTempId(TEMP_REF_PREFIX);
    setOrderedRows((prev) => [...prev, { ref_id: tempId, ...payload, is_active_bool: Boolean(draft.is_active) }]);
    setChanges((prev) => ({ ...prev, creates: [...prev.creates, { tempId, payload }] }));
    setDialog(EMPTY_DIALOG);
    setDraft({});
    toastSuccess("Record staged for Save Batch.", "Batching");
  }, [draft, selectColumns, booleanColumns]);

  const submitEdit = useCallback(() => {
    const row = dialog?.target;
    if (!row?.ref_id) { toastError("Invalid record."); return; }

    const missingField = selectColumns.find((col) => {
      const val = normalizeText(draft[col.field]);
      return col.required !== false && !val;
    });
    if (missingField) { toastError(`${missingField.label} is required.`); return; }

    const payload = {};
    selectColumns.forEach((col) => {
      const val = normalizeText(draft[col.field]);
      payload[col.field] = val === "" ? null : val;
    });
    booleanColumns.forEach((col) => { payload[col.field] = Boolean(draft[col.field]); });
    payload.is_active = Boolean(draft.is_active);
    if (Object.prototype.hasOwnProperty.call(draft || {}, "is_primary")) payload.is_primary = Boolean(draft.is_primary);

    const id = row.ref_id;
    setOrderedRows((prev) => prev.map((r) => isSameId(r?.ref_id, id) ? { ...r, ...payload, is_active_bool: Boolean(draft.is_active) } : r));
    setChanges((prev) => {
      if (isTempRefId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => isSameId(entry?.tempId, id) ? { ...entry, payload: { ...entry.payload, ...payload } } : entry),
        };
      }
      return {
        ...prev,
        updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], payload) },
      };
    });
    setDialog(EMPTY_DIALOG);
    setDraft({});
    toastSuccess("Edit staged for Save Batch.", "Batching");
  }, [dialog?.target, draft, selectColumns, booleanColumns]);

  const submitToggle = useCallback(() => {
    const row = dialog?.target;
    if (!row?.ref_id) { toastError("Invalid record."); return; }
    const id = row.ref_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedRows((prev) => prev.map((r) => isSameId(r?.ref_id, id) ? { ...r, is_active: nextIsActive, is_active_bool: nextIsActive } : r));
    setChanges((prev) => {
      if (isTempRefId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => isSameId(entry?.tempId, id) ? { ...entry, payload: { ...entry.payload, is_active: nextIsActive } } : entry),
        };
      }
      return {
        ...prev,
        updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { is_active: nextIsActive }) },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Record enabled — staged for Save Batch." : "Record disabled — staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  const submitDeactivate = useCallback(() => {
    const row = dialog?.target;
    if (!row?.ref_id) { toastError("Invalid record."); return; }
    const id = row.ref_id;
    if (isTempRefId(id)) {
      setOrderedRows((prev) => prev.filter((r) => !isSameId(r?.ref_id, id)));
      setChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, id)),
        updates: removeObjectKey(prev.updates, String(id)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged record removed.", "Batching");
      return;
    }
    setChanges((prev) => ({ ...prev, deactivations: appendUniqueId(prev.deactivations, id) }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);

  const handleInlineEdit = useCallback((row, field, value) => {
    const id = row?.ref_id;
    if (!id || isMutatingAction || isSavingBatch) return;
    setOrderedRows((prev) => prev.map((r) => isSameId(r?.ref_id, id) ? { ...r, [field]: value || null } : r));
    setChanges((prev) => {
      if (isTempRefId(id)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => isSameId(entry?.tempId, id) ? { ...entry, payload: { ...entry.payload, [field]: value || null } } : entry),
        };
      }
      return {
        ...prev,
        updates: { ...prev.updates, [String(id)]: mergeUpdatePatch(prev.updates?.[String(id)], { [field]: value || null }) },
      };
    });
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedRows, dialog, draft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedIds,
    setDialog, setDraft, closeDialog, openAddDialog, openEditDialog,
    openToggleDialog, openDeactivateDialog, stageHardDelete, unstageHardDelete,
    handleCancelBatch, handleSaveBatch, submitAdd, submitEdit,
    submitToggle, submitDeactivate, handleInlineEdit,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

function MappingHeader({ title, subtitle, hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddDialog, addLabel }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h4 className="mb-0">{title}</h4>
        <p className="text-muted small mb-0">{subtitle}</p>
      </div>
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
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddDialog}>
          {addLabel}
        </Button>
      </div>
    </div>
  );
}

function MappingTable({
  decoratedRows, isMutatingAction, isSavingBatch, pendingDeactivatedIds,
  openEditDialog, openToggleDialog, openDeactivateDialog, stageHardDelete, onUndoBatchAction,
  onInlineEdit, config,
}) {
  const { selectColumns = [], booleanColumns = [], idField = "id" } = config || {};

  const selectRender = useCallback((row, col) => {
    const matched = (col.options || []).find((opt) => isSameId(opt.value, row?.[col.field]));
    return <span className="small">{matched?.label || row?.[col.field] || "--"}</span>;
  }, []);

  const columns = useMemo(
    () => {
      const base = selectColumns.map((col) => ({
        key: col.field,
        label: col.label,
        width: col.width || "20%",
        sortable: true,
        render: (row) => {
          const m = batchMarker(row?.__batchState || "");
          return (
            <span>
              {selectRender(row, col)}
              {m.text ? <span className={m.cls}>{m.text}</span> : null}
            </span>
          );
        },
      }));
      const booleans = booleanColumns.map((col) => ({
        key: col.field || col.key,
        label: col.label,
        width: col.width || "10%",
        sortable: true,
        align: col.align || "center",
        render: (row) => <StatusBadge status={row?.[col.field] ? "active" : "inactive"} />,
      }));
      return [
        ...base,
        ...booleans,
        {
          key: "is_active_bool", label: "Active", width: "10%", sortable: true, align: "center",
          render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
        },
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booleanColumns, selectColumns, selectRender],
  );

  const actions = useMemo(
    () => [
      { key: "edit", label: "Edit", type: "secondary", icon: "pen", disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openEditDialog(row) },
      { key: "restore", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => !Boolean(row?.is_active_bool) || pendingDeactivatedIds.has(String(row?.ref_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleDialog(row) },
      { key: "deactivate", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedIds.has(String(row?.ref_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateDialog(row) },
      { key: "delete", label: "Delete", type: "danger", icon: "trash", confirm: true, confirmMessage: (row) => `Permanently delete this mapping? This action cannot be undone.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDelete(row) },
    ],
    [isMutatingAction, isSavingBatch, openDeactivateDialog, openEditDialog, openToggleDialog, pendingDeactivatedIds, stageHardDelete],
  );

  return (
    <TableZ columns={columns} data={decoratedRows} rowIdKey="ref_id" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No records found." />
  );
}

function MappingDialog({
  dialog, draft, isMutatingAction, isSavingBatch, setDraft, closeDialog,
  submitAdd, submitEdit, submitToggle, submitDeactivate, config,
}) {
  const { title, addLabel, selectColumns = [], booleanColumns = [] } = config || {};
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add") return addLabel;
    if (kind === "edit") return `Edit ${title}`;
    if (kind === "toggle") return dialog?.nextIsActive ? `Enable ${title}` : `Disable ${title}`;
    if (kind === "deactivate") return `Deactivate ${title}`;
    return title;
  }, [dialog?.kind, dialog?.nextIsActive, title, addLabel]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;

  return (
    <Modal show onHide={closeDialog} title={dialogTitle}>
      {(dialog.kind === "add" || dialog.kind === "edit") ? (
        <div>
          {selectColumns.map((col) => (
            <div className="mb-3" key={col.field}>
              <label className="form-label">{col.label}</label>
              <select
                className="form-select form-select-sm"
                value={String(draft[col.field] ?? "")}
                onChange={(e) => setDraft((prev) => ({ ...prev, [col.field]: e.target.value }))}
                disabled={isBusy}
              >
                <option value="">-- None --</option>
                {(col.options || []).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          ))}
          {booleanColumns.map((col) => (
            <div className="form-check mb-3" key={col.field || col.key}>
              <input
                type="checkbox"
                className="form-check-input"
                id={`map-bool-${col.field || col.key}`}
                checked={Boolean(draft[col.field])}
                onChange={(e) => setDraft((prev) => ({ ...prev, [col.field]: e.target.checked }))}
                disabled={isBusy}
              />
              <label className="form-check-label small" htmlFor={`map-bool-${col.field || col.key}`}>{col.label}</label>
            </div>
          ))}
          <div className="form-check mb-3">
            <input
              type="checkbox"
              className="form-check-input"
              id="map-active-chk"
              checked={Boolean(draft.is_active)}
              onChange={(e) => setDraft((prev) => ({ ...prev, is_active: e.target.checked }))}
              disabled={isBusy}
            />
            <label className="form-check-label small" htmlFor="map-active-chk">Active</label>
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={dialog.kind === "add" ? submitAdd : submitEdit}>
              {dialog.kind === "add" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? "Enable this mapping?" : "Disable this mapping?"}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggle}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate" ? (
        <div>
          <p className="mb-3">Deactivate this mapping? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivate}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function MappingTableView({ items, config, embedded = false, showHeader = true }) {
  const h = useMappingTable({ items, config });
  const { title, subtitle, addLabel } = config || {};

  const content = (
    <>
      {showHeader ? (
        <MappingHeader
          title={title} subtitle={subtitle}
          hasPendingChanges={h.hasPendingChanges} pendingSummary={h.pendingSummary}
          isSavingBatch={h.isSavingBatch} isMutatingAction={h.isMutatingAction}
          handleSaveBatch={h.handleSaveBatch} handleCancelBatch={h.handleCancelBatch}
          openAddDialog={h.openAddDialog} addLabel={addLabel}
        />
      ) : null}

      <MappingTable
        decoratedRows={h.decoratedRows}
        isMutatingAction={h.isMutatingAction} isSavingBatch={h.isSavingBatch}
        pendingDeactivatedIds={h.pendingDeactivatedIds}
        openEditDialog={h.openEditDialog} openToggleDialog={h.openToggleDialog}
        openDeactivateDialog={h.openDeactivateDialog}
        stageHardDelete={h.stageHardDelete} onUndoBatchAction={h.unstageHardDelete}
        onInlineEdit={h.handleInlineEdit}
        config={config}
      />

      <MappingDialog
        dialog={h.dialog} draft={h.draft}
        isMutatingAction={h.isMutatingAction} isSavingBatch={h.isSavingBatch}
        setDraft={h.setDraft} closeDialog={h.closeDialog}
        submitAdd={h.submitAdd} submitEdit={h.submitEdit}
        submitToggle={h.submitToggle} submitDeactivate={h.submitDeactivate}
        config={config}
      />
    </>
  );

  if (embedded) return content;

  return (
    <main className="container-fluid py-4">
      <div className="d-flex align-items-center mb-3">
        <div>
          <h1 className="h3 mb-0">{title}</h1>
          <p className="text-muted mb-0">{subtitle}</p>
        </div>
      </div>

      <div className="setup-split-layout">
        <WorkflowSideNav />

        <div className="setup-content-pane">
          {content}
        </div>
      </div>
    </main>
  );
}
