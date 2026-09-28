import { useCallback } from "react";
import {
  BATCH_TYPE_DELETED,
  resolveBatchTypeFromAction,
  resolveNextBatchState,
  toRowId,
} from "@/shared/components/ui/table/tableUtils";

export function useTableActions({
  batchMode = false,
  onBatchChange,
  onRowAction,
  batchApi,
  rowIdKey = "id",
}) {
  const handleAction = useCallback(
    ({ action, row, rowIndex }) => {
      if (!action) {
        return;
      }

      if (batchMode) {
        const batchType = resolveBatchTypeFromAction(action);

        // New diff-based path: delete actions toggle __pendingRemove
        if (batchType === BATCH_TYPE_DELETED && batchApi && typeof batchApi.removeRow === "function") {
          const rowId = toRowId(row, rowIdKey, rowIndex);
          batchApi.removeRow(rowId);
          return;
        }

        const nextBatchState = resolveNextBatchState(row?.__batchState, batchType);
        const nextRow = {
          ...(row || {}),
          __batchState: nextBatchState,
        };

        if (batchApi && typeof batchApi.stageRowChange === "function") {
          batchApi.stageRowChange({
            type: batchType,
            row: nextRow,
            previousRow: row,
            action,
            batchState: nextBatchState,
            rowIndex,
            source: "Table",
          });
          return;
        }

        if (typeof onBatchChange === "function") {
          onBatchChange({
            type: batchType,
            row: nextRow,
            previousRow: row,
            action,
            batchState: nextBatchState,
            rowIndex,
            source: "Table",
          });
        }

        return;
      }

      if (typeof onRowAction === "function") {
        onRowAction({ action, row, rowIndex });
        return;
      }

      if (typeof action.onClick === "function") {
        action.onClick(row, rowIndex);
      }
    },
    [batchApi, batchMode, onBatchChange, onRowAction, rowIdKey],
  );

  return {
    handleAction,
  };
}
