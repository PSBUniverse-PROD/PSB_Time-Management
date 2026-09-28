import { useCallback, useMemo } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  BATCH_STATE_CREATED,
  BATCH_STATE_DELETED,
  BATCH_STATE_UPDATED,
  normalizeBatchState,
  toRowId,
} from "@/shared/components/ui/table/tableUtils";

function applyReorderState(rows) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => {
    const nextOrder = index + 1;
    const previousOrder = Number(row?.order);
    const orderChanged = previousOrder !== nextOrder;
    const currentBatchState = normalizeBatchState(row?.__batchState);

    let nextBatchState = currentBatchState;
    if (orderChanged && currentBatchState !== BATCH_STATE_CREATED && currentBatchState !== BATCH_STATE_DELETED) {
      nextBatchState = BATCH_STATE_UPDATED;
    }

    return {
      ...(row || {}),
      order: nextOrder,
      __batchState: nextBatchState,
      __pendingRemove: Boolean(row?.__pendingRemove),
    };
  });
}

export function useTableDragNDrop({
  draggable = false,
  onReorder,
  rows,
  rowIdKey,
  batchMode = false,
  batchApi,
}) {
  const canDrag = draggable === true && typeof onReorder === "function";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
  );

  const rowIds = useMemo(
    () => (Array.isArray(rows) ? rows : []).map((row, index) => toRowId(row, rowIdKey, index)),
    [rowIdKey, rows],
  );

  const handleDragEnd = useCallback(
    (event) => {
      if (!canDrag) {
        return;
      }

      const activeId = String(event?.active?.id || "");
      const overId = String(event?.over?.id || "");

      if (!activeId || !overId || activeId === overId) {
        return;
      }

      const oldIndex = rowIds.indexOf(activeId);
      const newIndex = rowIds.indexOf(overId);

      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reorderedRows = arrayMove(rows, oldIndex, newIndex);
      const nextRows = applyReorderState(reorderedRows);

      if (batchMode && batchApi && typeof batchApi.applyReorder === "function") {
        batchApi.applyReorder(nextRows, { source: "Table" });
      }

      onReorder(nextRows);
    },
    [batchApi, batchMode, canDrag, onReorder, rowIds, rows],
  );

  const wrapWithDragContext = useCallback(
    (content, enabled) => {
      if (!enabled || !canDrag) {
        return content;
      }

      return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {content}
        </DndContext>
      );
    },
    [canDrag, handleDragEnd, sensors],
  );

  return {
    canDrag,
    rowIds,
    wrapWithDragContext,
  };
}
