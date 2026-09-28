import {
  ACTION_COLUMN_VISIBILITY_KEY,
  DEFAULT_MIN_COLUMN_WIDTH,
  isPlainObject,
  toIntegerOrFallback,
} from "@/shared/components/ui/table/tableUtils";

export function normalizeColumns(columns, { interactive = true } = {}) {
  return (Array.isArray(columns) ? columns : []).map((column, index) => {
    const key = String(column?.key || `column_${index}`).trim();
    const configuredWidth = toIntegerOrFallback(column?.width, 0);
    const configuredMinWidth = toIntegerOrFallback(column?.minWidth, DEFAULT_MIN_COLUMN_WIDTH);

    const minWidth = Math.max(DEFAULT_MIN_COLUMN_WIDTH, configuredMinWidth);
    const width = configuredWidth > 0 ? Math.max(configuredWidth, minWidth) : minWidth;

    return {
      ...column,
      key,
      label: String(column?.label || key),
      sortable: interactive ? column?.sortable === true : false,
      resizable: interactive ? column?.resizable !== false : false,
      minWidth,
      width,
    };
  });
}

export function normalizeColumnSizing(rawColumnSizing, columns) {
  const providedSizing = isPlainObject(rawColumnSizing) ? rawColumnSizing : {};
  const normalized = {};

  columns.forEach((column) => {
    const providedWidth = toIntegerOrFallback(providedSizing[column.key], 0);
    normalized[column.key] = providedWidth > 0 ? Math.max(providedWidth, column.minWidth) : column.width;
  });

  return normalized;
}

export function buildColumnVisibility({
  columnVisibilityState,
  normalizedColumns,
  actionColumnEnabled,
}) {
  const visibilityState = isPlainObject(columnVisibilityState) ? columnVisibilityState : {};
  const visibilityMap = {};

  if (actionColumnEnabled) {
    visibilityMap[ACTION_COLUMN_VISIBILITY_KEY] = visibilityState[ACTION_COLUMN_VISIBILITY_KEY] !== false;
  }

  normalizedColumns.forEach((column) => {
    visibilityMap[column.key] = visibilityState[column.key] !== false;
  });

  return visibilityMap;
}

export function getVisibleColumns(normalizedColumns, columnVisibility) {
  const nextVisibleColumns = normalizedColumns.filter((column) => columnVisibility[column.key] !== false);
  return nextVisibleColumns.length > 0 ? nextVisibleColumns : normalizedColumns.slice(0, 1);
}

export function buildSidePanelColumns({ actionColumnEnabled, normalizedColumns }) {
  if (!actionColumnEnabled) {
    return normalizedColumns;
  }

  return [
    {
      key: ACTION_COLUMN_VISIBILITY_KEY,
      label: "Actions",
      isSystem: true,
    },
    ...normalizedColumns,
  ];
}
