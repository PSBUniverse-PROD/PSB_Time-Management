import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// /* eslint-disable react-hooks/set-state-in-effect */
import {
  BATCH_STATE_NONE,
  normalizeBatchState,
  toRowId,
} from "@/shared/components/ui/table/tableUtils";

// ---------------------------------------------------------------------------
// Temp ID system
// ---------------------------------------------------------------------------

const TEMP_ID_PREFIX = "tmp-";

export function isTempId(value) {
  return String(value || "").startsWith(TEMP_ID_PREFIX);
}

export function createTempId(entityKey) {
  return `${TEMP_ID_PREFIX}${String(entityKey || "row")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function normalizeBatchValue(value, type = "text") {
  if (type === "number") {
    if (!hasValue(value)) return "";
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(parsed) : "";
  }
  if (type === "boolean") {
    return value === false || value === 0 || value === "0" ? "0" : "1";
  }
  return String(value ?? "").trim();
}

// ---------------------------------------------------------------------------
// Clone helper — always resets __pendingRemove
// ---------------------------------------------------------------------------

export function cloneBatchRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...(row || {}),
    __pendingRemove: false,
  }));
}

// ---------------------------------------------------------------------------
// buildBatchDiff — core diff engine (flat tables)
// ---------------------------------------------------------------------------

export function buildBatchDiff(draftRows, baselineRows, idKey, fields) {
  const safeFields = Array.isArray(fields) ? fields : [];
  const safeDraft = Array.isArray(draftRows) ? draftRows : [];
  const safeBaseline = Array.isArray(baselineRows) ? baselineRows : [];

  const baselineMap = new Map(
    safeBaseline
      .filter((row) => hasValue(row?.[idKey]))
      .map((row) => [String(row[idKey]), row]),
  );

  const byId = new Map();
  let newRows = 0;
  let modifiedRows = 0;
  let removedRows = 0;

  safeDraft.forEach((row) => {
    const rowId = String(row?.[idKey] ?? "");
    const baselineRow = baselineMap.get(rowId);
    const isNew = isTempId(rowId) || !baselineRow;
    const isPendingRemove = Boolean(row?.__pendingRemove);
    const changedColumns = new Set();

    if (!isNew && baselineRow) {
      safeFields.forEach((field) => {
        const key = typeof field === "string" ? field : field.key;
        const type = typeof field === "string" ? "text" : field.type || "text";
        if (normalizeBatchValue(row?.[key], type) !== normalizeBatchValue(baselineRow?.[key], type)) {
          changedColumns.add(key);
        }
      });
    }

    const isChanged = isNew || changedColumns.size > 0;

    if (isPendingRemove && !isNew) removedRows++;
    else if (isNew && !isPendingRemove) newRows++;
    else if (changedColumns.size > 0 && !isPendingRemove) modifiedRows++;

    byId.set(rowId, { isNew, isChanged, isPendingRemove, changedColumns });
  });

  return {
    byId,
    newRows,
    modifiedRows,
    removedRows,
    hasPendingChanges: newRows > 0 || modifiedRows > 0 || removedRows > 0,
  };
}

// ---------------------------------------------------------------------------
// buildSavePayload — DELETE → CREATE → UPDATE order
// ---------------------------------------------------------------------------

function stripBatchMetadata(row) {
  if (!row || typeof row !== "object") return row;
  const { __batchState, __pendingRemove, ...rest } = row;
  return rest;
}

function buildSavePayloadFromDiff(draftRows, diff, rowIdKey) {
  const deleted = [];
  const created = [];
  const updated = [];

  (Array.isArray(draftRows) ? draftRows : []).forEach((row, index) => {
    const rowId = toRowId(row, rowIdKey, index);
    const entry = diff?.byId?.get(rowId);
    if (!entry) return;

    if (entry.isPendingRemove && !entry.isNew) {
      deleted.push({ id: rowId });
      return;
    }
    if (entry.isPendingRemove) return;

    if (entry.isNew) {
      created.push({ tempId: rowId, data: stripBatchMetadata(row) });
      return;
    }
    if (entry.isChanged) {
      updated.push({ id: rowId, data: stripBatchMetadata(row), changedColumns: entry.changedColumns });
    }
  });

  return { deleted, created, updated };
}

// Legacy payload builder for external/batchState mode
function buildSavePayloadLegacy(rows, rowIdKey) {
  const created = [];
  const updated = [];
  const deleted = [];

  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const batchState = normalizeBatchState(row?.__batchState);
    if (batchState === BATCH_STATE_NONE) return;
    const rowId = toRowId(row, rowIdKey, index);

    if (batchState === "deleted") {
      deleted.push({ id: rowId });
    } else if (batchState === "created") {
      created.push({ tempId: rowId, data: stripBatchMetadata(row) });
    } else {
      updated.push({ id: rowId, data: stripBatchMetadata(row) });
    }
  });

  return { deleted, created, updated };
}

// ---------------------------------------------------------------------------
// Empty diff constant
// ---------------------------------------------------------------------------

const EMPTY_DIFF = Object.freeze({
  byId: new Map(),
  newRows: 0,
  modifiedRows: 0,
  removedRows: 0,
  hasPendingChanges: false,
});

// ---------------------------------------------------------------------------
// useTableBatchEdit — Draft + Baseline + Diff engine
// ---------------------------------------------------------------------------

export function useTableBatchEdit({
  data,
  rowIdKey = "id",
  batchMode = false,
  batchFields = [],
  onBatchChange,
  onBatchSave,
}) {
  const incomingData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const externalBatchMode = batchMode === true && typeof onBatchChange === "function";
  const hasBatchFields = Array.isArray(batchFields) && batchFields.length > 0;

  // -- Internal draft/baseline state (used when NOT in external batch mode) --
  const [draft, setDraft] = useState(() => cloneBatchRows(incomingData));
  const [baseline, setBaseline] = useState(() => cloneBatchRows(incomingData));
  const [dirty, setDirty] = useState(false);

  // Sync baseline+draft when incoming data changes (from server reload etc.)
  useEffect(() => {
    if (!batchMode) {
      setBaseline(cloneBatchRows(incomingData));
      setDraft(cloneBatchRows(incomingData));
      setDirty(false);
      return;
    }
    if (externalBatchMode || !dirty) {
      setBaseline(cloneBatchRows(incomingData));
      setDraft(cloneBatchRows(incomingData));
      setDirty(false);
    }
  }, [batchMode, dirty, externalBatchMode, incomingData]);

  // Decide which rows are authoritative
  const rows = batchMode && !externalBatchMode ? draft : incomingData;

  // -- Diff computation --
  const diff = useMemo(() => {
    if (!batchMode) return EMPTY_DIFF;
    if (externalBatchMode && !hasBatchFields) return EMPTY_DIFF;

    const draftRows = externalBatchMode ? incomingData : draft;
    const baselineRows = baseline;

    if (!hasBatchFields) {
      // Legacy: detect changes via __batchState stamps
      const byId = new Map();
      let newRows = 0, modifiedRows = 0, removedRows = 0;
      (Array.isArray(draftRows) ? draftRows : []).forEach((row, index) => {
        const rowId = toRowId(row, rowIdKey, index);
        const state = normalizeBatchState(row?.__batchState);
        const isPendingRemove = Boolean(row?.__pendingRemove) || state === "deleted";
        const isNew = isTempId(rowId) || state === "created";
        const isChanged = isNew || state !== BATCH_STATE_NONE;
        if (isPendingRemove && !isNew) removedRows++;
        else if (isNew && !isPendingRemove) newRows++;
        else if (isChanged && !isNew && !isPendingRemove) modifiedRows++;
        byId.set(rowId, { isNew, isChanged, isPendingRemove, changedColumns: new Set() });
      });
      return { byId, newRows, modifiedRows, removedRows, hasPendingChanges: newRows > 0 || modifiedRows > 0 || removedRows > 0 };
    }

    return buildBatchDiff(draftRows, baselineRows, rowIdKey, batchFields);
  }, [batchMode, externalBatchMode, hasBatchFields, incomingData, draft, baseline, rowIdKey, batchFields]);

  const hasPendingChanges = diff.hasPendingChanges;

  // -- Stage a single row change --
  const stageRowChange = useCallback(
    (payload) => {
      if (!batchMode) return;

      if (externalBatchMode) {
        onBatchChange?.(payload);
        return;
      }

      const nextRowId = toRowId(payload?.row, rowIdKey, payload?.rowIndex || 0);

      setDraft((prev) =>
        prev.map((row, index) => {
          const currentRowId = toRowId(row, rowIdKey, index);
          return currentRowId === nextRowId ? { ...(payload?.row || {}), __pendingRemove: Boolean(payload?.row?.__pendingRemove) } : row;
        }),
      );
      setDirty(true);
    },
    [batchMode, externalBatchMode, onBatchChange, rowIdKey],
  );

  // -- Add a new row to draft --
  const addRow = useCallback(
    (newRow) => {
      if (!batchMode) return;

      if (externalBatchMode) {
        onBatchChange?.({ type: "create", row: newRow, source: "Table" });
        return;
      }

      setDraft((prev) => [{ ...(newRow || {}), __pendingRemove: false }, ...prev]);
      setDirty(true);
    },
    [batchMode, externalBatchMode, onBatchChange],
  );

  // -- Toggle __pendingRemove on a row --
  const removeRow = useCallback(
    (rowId) => {
      if (!batchMode) return;

      if (externalBatchMode) {
        onBatchChange?.({ type: "delete", rowId, source: "Table" });
        return;
      }

      setDraft((prev) => {
        // If temp ID, remove entirely
        if (isTempId(rowId)) {
          return prev.filter((row, index) => toRowId(row, rowIdKey, index) !== rowId);
        }
        // Otherwise toggle __pendingRemove
        return prev.map((row, index) => {
          const id = toRowId(row, rowIdKey, index);
          return id === rowId ? { ...row, __pendingRemove: !row.__pendingRemove } : row;
        });
      });
      setDirty(true);
    },
    [batchMode, externalBatchMode, onBatchChange, rowIdKey],
  );

  // -- Update specific fields on a draft row --
  const updateRow = useCallback(
    (rowId, updates) => {
      if (!batchMode) return;

      if (externalBatchMode) {
        onBatchChange?.({ type: "update", rowId, updates, source: "Table" });
        return;
      }

      setDraft((prev) =>
        prev.map((row, index) => {
          const id = toRowId(row, rowIdKey, index);
          return id === rowId ? { ...row, ...(updates || {}) } : row;
        }),
      );
      setDirty(true);
    },
    [batchMode, externalBatchMode, onBatchChange, rowIdKey],
  );

  // -- Apply reorder --
  const applyReorder = useCallback(
    (nextRows, meta = {}) => {
      if (!batchMode) return;

      if (externalBatchMode) {
        onBatchChange?.({ type: "reorder", rows: nextRows, source: meta.source || "Table" });
        return;
      }

      setDraft(Array.isArray(nextRows) ? nextRows.map((r) => ({ ...(r || {}), __pendingRemove: Boolean(r?.__pendingRemove) })) : []);
      setDirty(true);
    },
    [batchMode, externalBatchMode, onBatchChange],
  );

  // -- Cancel batch: restore draft from baseline --
  const cancelBatch = useCallback(() => {
    const restoredRows = cloneBatchRows(baseline);

    if (!batchMode) return restoredRows;

    if (externalBatchMode) {
      onBatchChange?.({ type: "cancel", rows: restoredRows, source: "Table" });
      return restoredRows;
    }

    setDraft(restoredRows);
    setDirty(false);
    return restoredRows;
  }, [batchMode, baseline, externalBatchMode, onBatchChange]);

  // -- Save batch --
  const saveBatch = useCallback(async () => {
    if (!batchMode || typeof onBatchSave !== "function") return null;

    const payload = hasBatchFields
      ? buildSavePayloadFromDiff(rows, diff, rowIdKey)
      : buildSavePayloadLegacy(rows, rowIdKey);

    await onBatchSave(payload);

    // After save: server data will flow in via props, resetting baseline+draft
    if (!externalBatchMode) {
      const committed = cloneBatchRows(rows);
      setBaseline(committed);
      setDraft(cloneBatchRows(committed));
      setDirty(false);
    }

    return payload;
  }, [batchMode, diff, externalBatchMode, hasBatchFields, onBatchSave, rowIdKey, rows]);

  // -- Pending payload (for external inspection) --
  const pendingPayload = useMemo(
    () => hasBatchFields ? buildSavePayloadFromDiff(rows, diff, rowIdKey) : buildSavePayloadLegacy(rows, rowIdKey),
    [diff, hasBatchFields, rowIdKey, rows],
  );

  return {
    rows,
    baseline,
    diff,
    externalBatchMode,
    hasPendingChanges,
    pendingPayload,
    stageRowChange,
    addRow,
    removeRow,
    updateRow,
    applyReorder,
    saveBatch,
    cancelBatch,
  };
}
