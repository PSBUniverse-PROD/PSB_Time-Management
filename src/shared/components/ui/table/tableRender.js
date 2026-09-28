import React from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical } from "@fortawesome/free-solid-svg-icons";
import Button from "@/shared/components/ui/controls/Button";
import ActionColumn from "@/shared/components/ui/table/ActionColumn";
import { getNestedValue, resolveBatchClassName, resolveBatchDiffClassName, resolveCellDiffClassName, toRowId } from "@/shared/components/ui/table/tableUtils";

function resolveCellStyle(column) {
  return {
    width: column?.width,
    textAlign: column?.align || "left",
    verticalAlign: "middle",
    wordBreak: "break-word",
  };
}

function renderFallbackValue(value, emptyValue) {
  return value === undefined || value === null || value === "" ? emptyValue : value;
}

function ActionCell({
  row,
  rowIndex,
  draggable,
  dragHandleProps,
  actions,
  onAction,
  onUndoBatchAction,
}) {
  return (
    <td
      className="psb-ui-table-actions-cell"
      onClick={(event) => {
        event.stopPropagation();
      }}
    >
      {draggable ? (
        <div className="d-flex align-items-center justify-content-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2 psb-setup-action-btn psb-setup-action-drag"
            aria-label="Drag row to reorder"
            title="Drag row to reorder"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            {...dragHandleProps}
          >
            <FontAwesomeIcon icon={faGripVertical} aria-hidden="true" />
          </Button>
          <ActionColumn
            row={row}
            actions={actions}
            onAction={({ action, row: actionRow }) =>
              onAction?.({
                action,
                row: actionRow || row,
                rowIndex,
              })
            }
            onUndoBatchAction={onUndoBatchAction}
          />
        </div>
      ) : (
        <ActionColumn
          row={row}
          actions={actions}
          onAction={({ action, row: actionRow }) =>
            onAction?.({
              action,
              row: actionRow || row,
              rowIndex,
            })
          }
          onUndoBatchAction={onUndoBatchAction}
        />
      )}
    </td>
  );
}

function DataRowCells({
  row,
  rowId,
  rowIndex,
  columns,
  renderCellContext,
  emptyValue,
  diffEntry,
}) {
  return columns.map((column) => {
    const rawValue = getNestedValue(row, column.key);
    const rendered =
      typeof column.render === "function"
        ? column.render(row, rawValue, renderCellContext({ row, rowIndex, column }))
        : renderFallbackValue(rawValue, emptyValue);

    const cellDiffClass = resolveCellDiffClassName(diffEntry, column.key);
    const cellStyle = resolveCellStyle(column);

    return (
      <td key={`${rowId}-${column.key}`} style={cellStyle} className={cellDiffClass || undefined}>
        {rendered}
      </td>
    );
  });
}

function SortableBodyRow({
  row,
  rowIndex,
  rowId,
  columns,
  actionColumnVisible,
  rowClickable,
  selectedRowId,
  rowIdKey,
  onRowClick,
  actions,
  onAction,
  onUndoBatchAction,
  renderCellContext,
  emptyValue,
  striped,
  batchDiff,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rowId });
  const isSelected = String(selectedRowId ?? "") === String(row?.[rowIdKey] ?? "");
  const diffEntry = batchDiff?.get(rowId);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    backgroundColor: isSelected ? "#eef4ff" : undefined,
    opacity: isDragging ? 0.85 : 1,
    cursor: rowClickable ? "pointer" : "default",
  };

  const batchRowClass = diffEntry
    ? resolveBatchDiffClassName(diffEntry)
    : resolveBatchClassName(row?.__batchState);

  const rowClassName = [
    "psb-setup-row",
    striped && rowIndex % 2 === 1 ? "table-light" : "",
    batchRowClass,
    isSelected ? "psb-setup-row-selected" : "",
  ].filter(Boolean).join(" ");

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={rowClassName}
      onClick={rowClickable ? () => onRowClick(row) : undefined}
    >
      {actionColumnVisible ? (
        <ActionCell
          row={row}
          rowIndex={rowIndex}
          draggable
          dragHandleProps={{ ...attributes, ...listeners }}
          actions={actions}
          onAction={onAction}
          onUndoBatchAction={onUndoBatchAction}
        />
      ) : null}
      <DataRowCells
        row={row}
        rowId={rowId}
        rowIndex={rowIndex}
        columns={columns}
        renderCellContext={renderCellContext}
        emptyValue={emptyValue}
        diffEntry={diffEntry}
      />
    </tr>
  );
}

function StaticBodyRow({
  row,
  rowIndex,
  rowId,
  columns,
  actionColumnVisible,
  rowClickable,
  selectedRowId,
  rowIdKey,
  onRowClick,
  actions,
  onAction,
  onUndoBatchAction,
  renderCellContext,
  emptyValue,
  striped,
  batchDiff,
}) {
  const isSelected = String(selectedRowId ?? "") === String(row?.[rowIdKey] ?? "");
  const diffEntry = batchDiff?.get(rowId);

  const batchRowClass = diffEntry
    ? resolveBatchDiffClassName(diffEntry)
    : resolveBatchClassName(row?.__batchState);

  const rowClassName = [
    "psb-setup-row",
    striped && rowIndex % 2 === 1 ? "table-light" : "",
    batchRowClass,
    isSelected ? "psb-setup-row-selected" : "",
  ].filter(Boolean).join(" ");

  return (
    <tr
      style={{
        backgroundColor: isSelected ? "#eef4ff" : undefined,
        cursor: rowClickable ? "pointer" : "default",
      }}
      className={rowClassName}
      onClick={rowClickable ? () => onRowClick(row) : undefined}
    >
      {actionColumnVisible ? (
        <ActionCell
          row={row}
          rowIndex={rowIndex}
          draggable={false}
          actions={actions}
          onAction={onAction}
          onUndoBatchAction={onUndoBatchAction}
        />
      ) : null}
      <DataRowCells
        row={row}
        rowId={rowId}
        rowIndex={rowIndex}
        columns={columns}
        renderCellContext={renderCellContext}
        emptyValue={emptyValue}
        diffEntry={diffEntry}
      />
    </tr>
  );
}

export function renderTableBody({
  rows,
  rowIdKey,
  columns,
  actionColumnVisible,
  actions,
  draggable,
  rowIds,
  selectedRowId,
  onRowClick,
  onAction,
  onUndoBatchAction,
  emptyMessage,
  emptyColSpan,
  renderCellContext,
  emptyValue,
  striped = false,
  batchDiff,
  renderDetail,
}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const hasRows = normalizedRows.length > 0;
  const rowClickable = typeof onRowClick === "function";
  const hasRenderDetail = typeof renderDetail === "function";

  if (!hasRows) {
    return (
      <tbody>
        <tr>
          <td colSpan={emptyColSpan} className="text-muted text-center py-3">
            {emptyMessage}
          </td>
        </tr>
      </tbody>
    );
  }

  if (draggable) {
    return (
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <tbody>
          {normalizedRows.map((row, rowIndex) => {
            const rowId = toRowId(row, rowIdKey, rowIndex);
            const isSelected = hasRenderDetail && String(selectedRowId ?? "") === String(row?.[rowIdKey] ?? "");
            const detailContent = isSelected ? renderDetail(row) : null;

            return (
              <React.Fragment key={rowId}>
                <SortableBodyRow
                  row={row}
                  rowIndex={rowIndex}
                  rowId={rowId}
                  columns={columns}
                  actionColumnVisible={actionColumnVisible}
                  rowClickable={rowClickable}
                  selectedRowId={selectedRowId}
                  rowIdKey={rowIdKey}
                  onRowClick={onRowClick}
                  actions={actions}
                  onAction={onAction}
                  onUndoBatchAction={onUndoBatchAction}
                  renderCellContext={renderCellContext}
                  emptyValue={emptyValue}
                  striped={striped}
                  batchDiff={batchDiff}
                />
                {detailContent ? (
                  <tr className="psb-ui-table-detail-row">
                    <td colSpan={emptyColSpan}>
                      {detailContent}
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </SortableContext>
    );
  }

  return (
    <tbody>
      {normalizedRows.map((row, rowIndex) => {
        const rowId = toRowId(row, rowIdKey, rowIndex);
        const isSelected = hasRenderDetail && String(selectedRowId ?? "") === String(row?.[rowIdKey] ?? "");
        const detailContent = isSelected ? renderDetail(row) : null;

        return (
          <React.Fragment key={rowId}>
            <StaticBodyRow
              row={row}
              rowIndex={rowIndex}
              rowId={rowId}
              columns={columns}
              actionColumnVisible={actionColumnVisible}
              rowClickable={rowClickable}
              selectedRowId={selectedRowId}
              rowIdKey={rowIdKey}
              onRowClick={onRowClick}
              actions={actions}
              onAction={onAction}
              onUndoBatchAction={onUndoBatchAction}
              renderCellContext={renderCellContext}
              emptyValue={emptyValue}
              striped={striped}
              batchDiff={batchDiff}
            />
            {detailContent ? (
              <tr className="psb-ui-table-detail-row">
                <td colSpan={emptyColSpan}>
                  {detailContent}
                </td>
              </tr>
            ) : null}
          </React.Fragment>
        );
      })}
    </tbody>
  );
}
