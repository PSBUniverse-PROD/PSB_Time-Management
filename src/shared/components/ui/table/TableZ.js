"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Form, Spinner, Table as BootstrapTable } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSort, faSortUp, faSortDown, faChevronUp, faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { faFloppyDisk } from "@fortawesome/free-regular-svg-icons";
import SearchBar from "@/shared/components/ui/controls/SearchBar";
import MultiSelectDropdown from "@/shared/components/ui/controls/MultiSelectDropdown";
import { TableContextMenuWrapper } from "@/shared/components/ui/table/TableContextMenu";
import { TableSidePanelWrapper } from "@/shared/components/ui/table/TableSidePanel";
import { createFilterConfig, TABLE_FILTER_TYPES } from "@/shared/components/ui/table/filterSchema";
import { useTableActions } from "@/shared/components/ui/table/tableActions";
import { useTableBatchEdit } from "@/shared/components/ui/table/tableBatchEdit";
import {
  buildColumnVisibility,
  buildSidePanelColumns,
  getVisibleColumns,
  normalizeColumns,
  normalizeColumnSizing,
} from "@/shared/components/ui/table/tableColumns";
import { useTableDragNDrop } from "@/shared/components/ui/table/tableDragNDrop";
import { renderTableBody } from "@/shared/components/ui/table/tableRender";
import { useTableState } from "@/shared/components/ui/table/tableState";
import {
  ACTION_COLUMN_VISIBILITY_KEY,
  buildPageList,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  DEFAULT_SEARCH_DEBOUNCE_MS,
  getNestedValue,
  getDateRangeValue,
  isEmptyFilterValue,
  isPlainObject,
  normalizeFilterOptions,
  normalizePageSizeOptions,
  toIntegerOrFallback,
} from "@/shared/components/ui/table/tableUtils";

const SETUP_ACTION_COLUMN_WIDTH = 92;

function normalizeSortDirection(direction) {
  return String(direction || "").toLowerCase() === "desc" ? "desc" : "asc";
}

function normalizeSortingState(rawSorting) {
  if (!isPlainObject(rawSorting)) {
    return {
      key: "",
      direction: "",
    };
  }

  const key = String(rawSorting.key || "").trim();
  return {
    key,
    direction: key ? normalizeSortDirection(rawSorting.direction) : "",
  };
}

function toDateTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }

  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function compareSortValues(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (bothNumeric) {
    return leftNumber - rightNumber;
  }

  const leftDate = toDateTimestamp(left);
  const rightDate = toDateTimestamp(right);
  const bothDates = Number.isFinite(leftDate) && Number.isFinite(rightDate);

  if (bothDates) {
    return leftDate - rightDate;
  }

  return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function matchesFilter(row, filter, filterValue) {
  const rowValue = getNestedValue(row, filter.key);

  if (filter.type === TABLE_FILTER_TYPES.DATERANGE) {
    const range = getDateRangeValue(filterValue);
    const start = toDateTimestamp(range.start);
    const end = toDateTimestamp(range.end);
    const rowTime = toDateTimestamp(rowValue);

    if (!Number.isFinite(rowTime)) {
      return false;
    }

    if (Number.isFinite(start) && rowTime < start) {
      return false;
    }

    if (Number.isFinite(end) && rowTime > end) {
      return false;
    }

    return true;
  }

  if (filter.type === TABLE_FILTER_TYPES.SELECT || filter.type === TABLE_FILTER_TYPES.DATE) {
    // Support single-value filters and array (multi-select) filters.
    if (Array.isArray(filterValue)) {
      const normalized = filterValue.map((v) => String(v ?? ""));
      return normalized.includes(String(rowValue ?? ""));
    }

    return String(rowValue ?? "") === String(filterValue ?? "");
  }

  return String(rowValue ?? "").toLowerCase().includes(String(filterValue ?? "").toLowerCase());
}

function isDevEnvironment() {
  return process.env.NODE_ENV !== "production";
}

function ensure(condition, message) {
  if (!condition) {
    throw new Error(`[Table] ${message}`);
  }
}

function validateTableProps({
  data,
  columns,
  state,
  filterConfig,
  actions,
  onChange,
  loading,
  controlled,
  batchMode,
  onBatchChange,
}) {
  ensure(Array.isArray(data), "data must be an array.");
  ensure(Array.isArray(columns), "columns must be an array.");
  ensure(Array.isArray(filterConfig), "filterConfig must be an array.");
  ensure(Array.isArray(actions), "actions must be an array.");
  ensure(typeof loading === "boolean", "loading must be a boolean.");

  if (controlled) {
    ensure(isPlainObject(state), "state must be an object when using controlled mode.");
    ensure(typeof onChange === "function", "onChange must be a function when using controlled mode.");
    createFilterConfig(filterConfig);
  }

  if (batchMode === true) {
    ensure(
      typeof onBatchChange === "function" || typeof onChange === "function",
      "onBatchChange or onChange must be provided when batchMode is enabled.",
    );
  }

  const usedColumnKeys = new Set();

  columns.forEach((column, index) => {
    ensure(isPlainObject(column), `column at index ${index} must be an object.`);

    const key = String(column.key || "").trim();
    ensure(key !== "", `column at index ${index} is missing key.`);
    ensure(key !== ACTION_COLUMN_VISIBILITY_KEY, `column key "${ACTION_COLUMN_VISIBILITY_KEY}" is reserved.`);
    ensure(!usedColumnKeys.has(key), `column key "${key}" is duplicated.`);
    usedColumnKeys.add(key);

    ensure(String(column.label || "").trim() !== "", `column ${key} is missing label.`);

    if (column.render !== undefined) {
      ensure(typeof column.render === "function", `column ${key} render must be a function.`);
    }
  });

  const usedActionKeys = new Set();

  actions.forEach((action, index) => {
    ensure(isPlainObject(action), `action at index ${index} must be an object.`);

    const key = String(action.key || "").trim();
    ensure(key !== "", `action at index ${index} is missing key.`);
    ensure(!usedActionKeys.has(key), `action key "${key}" is duplicated.`);
    usedActionKeys.add(key);

    ensure(String(action.label || "").trim() !== "", `action ${key} is missing label.`);
    ensure(typeof action.onClick === "function", `action ${key} onClick must be a function.`);
  });
}

/**
 * Full-featured shared data table.
 *
 * UI anatomy, from top to bottom:
 * 1. Page/Main Toolbar - parent-owned. Use it for page title, record count,
 *    tabs, Add actions, or other page-level controls. TableZ does not render it.
 * 2. Batch Toolbar - TableZ-owned and shown only for pending batch changes.
 * 3. Filter Toolbar - TableZ-owned and shown when filterConfig has filters.
 * 4. Search Toolbar - TableZ-owned unless hideSearch is true.
 * 5. Table Surface - headers, sorting, resizing, rows, actions, drag handles,
 *    loading, empty, and detail states.
 * 6. Table Footer - TableZ-owned unless hideFooter is true; contains row count,
 *    page-size selection, and pagination.
 *
 * TableZ owns table interaction state in uncontrolled mode. In controlled mode,
 * pass state and onChange; the parent owns data fetching and state updates.
 * Database access and mutations always remain in the parent module.
 *
 * The compact operational styling is the shared TableZ baseline. The optional
 * variant prop is retained for compatibility, and variant="setup" is an alias
 * for the same baseline rather than a separate visual system.
 *
 * @param {Object} props
 * @param {Array<Object>} props.data Rows to render.
 * @param {Array<Object>} props.columns Column definitions with key and label.
 * @param {string} props.rowIdKey Unique row identity field; defaults to "id".
 * @param {Array<Object>} props.actions Row action definitions.
 * @param {boolean} props.draggable Enable drag-and-drop ordering.
 * @param {Function} props.onReorder Receives the reordered rows.
 * @param {Array<Object>} props.filterConfig Filter Toolbar definitions.
 * @param {Object} props.state Controlled table state.
 * @param {Function} props.onChange Controlled-mode event channel.
 * @param {boolean} props.hideSearch Hide the Search Toolbar.
 * @param {boolean} props.hideFooter Hide the Table Footer.
 * @param {string} props.variant Compatibility/display hint, including "setup".
 * @returns {JSX.Element} The complete TableZ surface.
 */
export default function TableZ({
  data = [],
  columns = [],
  rowIdKey = "id",
  selectedRowId = null,
  onRowClick,
  actions = [],
  showActionColumn = true,
  batchMode = false,
  batchFields = [],
  onBatchChange,
  onBatchSave,
  draggable = false,
  onReorder,
  state,
  filterConfig = [],
  onChange,
  onHeaderContextMenu,
  loading = false,
  className = "",
  variant = "",
  emptyMessage = "No records found.",
  loadingMessage = "Loading records...",
  searchPlaceholder = "Search",
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  exportFormats = ["csv", "excel"],
  onUndoBatchAction,
  hideSearch = false,
  hideFooter = false,
  renderDetail,
}) {
  const tableId = useId();
  const controlledMode = isPlainObject(state) && typeof onChange === "function";
  const variantClassName = variant ? `psb-ui-table--${variant}` : "";
  const actionColumnWidth = SETUP_ACTION_COLUMN_WIDTH;
  const tableClassName = controlledMode
    ? ["psb-ui-table", "psb-ui-data-table", "psb-ui-table--setup", variantClassName, className].filter(Boolean).join(" ")
    : ["psb-ui-table", "psb-ui-data-table", "table-sm", "mb-0", "psb-ui-table--setup", variantClassName, className].filter(Boolean).join(" ");

  if (isDevEnvironment()) {
    validateTableProps({
      data,
      columns,
      state,
      filterConfig,
      actions,
      onChange,
      loading,
      controlled: controlledMode,
      batchMode,
      onBatchChange,
    });
  }

  const dataset = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const batch = useTableBatchEdit({
    data: dataset,
    rowIdKey,
    batchMode,
    batchFields,
    onBatchChange,
    onBatchSave,
  });

  const rows = batch.rows;

  const tableState = useTableState({
    controlled: controlledMode,
    state,
    filterConfig,
    pageSizeOptions,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    onChange,
  });

  const normalizedColumns = useMemo(
    () => normalizeColumns(columns, { interactive: true }),
    [columns],
  );

  const actionColumnEnabled =
    showActionColumn === true
    && (draggable === true || (Array.isArray(actions) && actions.length > 0));

  const [uncontrolledFilters, setUncontrolledFilters] = useState({});
  const [uncontrolledSorting, setUncontrolledSorting] = useState({ key: "", direction: "" });
  const [uncontrolledPage, setUncontrolledPage] = useState(1);
  const [uncontrolledPageSize, setUncontrolledPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [uncontrolledColumnVisibility, setUncontrolledColumnVisibility] = useState({});
  const [uncontrolledColumnSizing, setUncontrolledColumnSizing] = useState({});

  const effectiveFilters = controlledMode ? tableState.filters : uncontrolledFilters;
  const effectiveSorting = controlledMode ? tableState.normalizedSorting : normalizeSortingState(uncontrolledSorting);
  const effectiveColumnVisibilityState = controlledMode ? state?.columnVisibility : uncontrolledColumnVisibility;
  const effectiveColumnSizingState = controlledMode ? state?.columnSizing : uncontrolledColumnSizing;

  const columnSizing = useMemo(
    () => normalizeColumnSizing(effectiveColumnSizingState, normalizedColumns),
    [effectiveColumnSizingState, normalizedColumns],
  );

  const columnVisibility = useMemo(
    () =>
      buildColumnVisibility({
        columnVisibilityState: effectiveColumnVisibilityState,
        normalizedColumns,
        actionColumnEnabled,
      }),
    [actionColumnEnabled, effectiveColumnVisibilityState, normalizedColumns],
  );

  const actionColumnVisible =
    actionColumnEnabled
    && columnVisibility[ACTION_COLUMN_VISIBILITY_KEY] !== false;

  const visibleColumns = useMemo(
    () => getVisibleColumns(normalizedColumns, columnVisibility),
    [columnVisibility, normalizedColumns],
  );

  useEffect(() => {
    if (controlledMode) {
      return;
    }

    setUncontrolledColumnVisibility((previous) => {
      const next = {};

      if (actionColumnEnabled) {
        next[ACTION_COLUMN_VISIBILITY_KEY] = previous[ACTION_COLUMN_VISIBILITY_KEY] !== false;
      }

      normalizedColumns.forEach((column) => {
        const hasExplicitState = previous[column.key] !== undefined;
        next[column.key] = hasExplicitState
          ? previous[column.key] !== false
          : column.defaultVisible !== false;
      });

      if (normalizedColumns.length > 0 && normalizedColumns.every((column) => next[column.key] === false)) {
        next[normalizedColumns[0].key] = true;
      }

      return next;
    });
  }, [actionColumnEnabled, controlledMode, normalizedColumns]);

  const getColumnWidth = useCallback(
    (column) => {
      const fromState = toIntegerOrFallback(columnSizing[column.key], column.width);
      return Math.max(column.minWidth, fromState);
    },
    [columnSizing],
  );

  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [isBatchSubmitting, setIsBatchSubmitting] = useState(false);
  const [activeResizeColumnKey, setActiveResizeColumnKey] = useState("");
  const [contextMenuState, setContextMenuState] = useState({
    open: false,
    x: 0,
    y: 0,
  });

  const resizeStateRef = useRef(null);
  const columnSizingRef = useRef(columnSizing);
  const searchInputId = `${tableId}-search`;

  useEffect(() => {
    columnSizingRef.current = columnSizing;
  }, [columnSizing]);

  const closeContextMenu = useCallback(() => {
    setContextMenuState((current) => ({
      ...current,
      open: false,
    }));
  }, []);

  const handleHeaderContextMenu = useCallback(
    (event, column = null) => {
      event.preventDefault();

      if (typeof onHeaderContextMenu === "function") {
        onHeaderContextMenu(event, column);
        return;
      }

      setContextMenuState({
        open: true,
        x: event.clientX,
        y: event.clientY,
      });
    },
    [onHeaderContextMenu],
  );

  const startResize = useCallback(
    (event, column) => {
      event.preventDefault();
      event.stopPropagation();

      resizeStateRef.current = {
        columnKey: column.key,
        minWidth: column.minWidth,
        startX: event.clientX,
        startWidth: getColumnWidth(column),
      };

      setActiveResizeColumnKey(column.key);
    },
    [getColumnWidth],
  );

  const handleResizeMouseMove = useCallback(
    (event) => {
      if (!resizeStateRef.current) {
        return;
      }

      const { columnKey, minWidth, startX, startWidth } = resizeStateRef.current;
      const deltaX = event.clientX - startX;
      const nextWidth = Math.max(minWidth, startWidth + deltaX);
      const nextColumnSizing = {
        ...columnSizingRef.current,
        [columnKey]: nextWidth,
      };

      if (controlledMode) {
        tableState.emitChange({
          type: "columnResize",
          columnKey,
          width: nextWidth,
          columnSizing: nextColumnSizing,
        });
      } else {
        setUncontrolledColumnSizing(nextColumnSizing);
      }
    },
    [controlledMode, tableState],
  );

  const handleResizeMouseUp = useCallback(() => {
    if (!resizeStateRef.current) {
      return;
    }

    resizeStateRef.current = null;
    setActiveResizeColumnKey("");
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleResizeMouseMove);
    window.addEventListener("mouseup", handleResizeMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleResizeMouseMove);
      window.removeEventListener("mouseup", handleResizeMouseUp);
    };
  }, [handleResizeMouseMove, handleResizeMouseUp]);

  const handleToggleColumnVisibility = useCallback(
    (columnKey, nextVisible) => {
      const currentlyVisible = columnVisibility[columnKey] !== false;
      const visibleDataColumnCount = normalizedColumns.filter((column) => columnVisibility[column.key] !== false).length;

      if (
        columnKey !== ACTION_COLUMN_VISIBILITY_KEY
        && !nextVisible
        && currentlyVisible
        && visibleDataColumnCount <= 1
      ) {
        return;
      }

      const nextVisibility = {
        ...columnVisibility,
        [columnKey]: nextVisible,
      };

      if (controlledMode) {
        tableState.emitChange({
          type: "columnVisibility",
          columnVisibility: nextVisibility,
          columnKey,
          visible: nextVisible,
        });
      } else {
        setUncontrolledColumnVisibility(nextVisibility);
      }
    },
    [columnVisibility, controlledMode, normalizedColumns, tableState],
  );

  const handleExport = useCallback(
    (format) => {
      tableState.emitChange({
        type: "export",
        format,
        context: {
          filters: effectiveFilters,
          sorting: effectiveSorting,
          pagination: {
            page: controlledMode ? tableState.safePage : Math.max(1, toIntegerOrFallback(uncontrolledPage, 1)),
            pageSize: controlledMode
              ? tableState.normalizedPagination.pageSize
              : Math.max(1, toIntegerOrFallback(uncontrolledPageSize, DEFAULT_PAGE_SIZE)),
            total: controlledMode ? tableState.normalizedPagination.total : rows.length,
          },
          visibleColumnKeys: visibleColumns.map((column) => column.key),
        },
      });
    },
    [controlledMode, effectiveFilters, effectiveSorting, rows.length, tableState, uncontrolledPage, uncontrolledPageSize, visibleColumns],
  );

  const batchControlsVisible = batchMode === true;
  const batchDiff = batch.diff;
  const batchDiffById = batchDiff?.byId;

  const handleSaveBatch = useCallback(async () => {
    if (!batchControlsVisible || !batch.hasPendingChanges || isBatchSubmitting) {
      return;
    }

    setIsBatchSubmitting(true);

    try {
      await batch.saveBatch();
    } finally {
      setIsBatchSubmitting(false);
    }
  }, [batch, batchControlsVisible, isBatchSubmitting]);

  const handleCancelBatch = useCallback(() => {
    if (!batchControlsVisible || !batch.hasPendingChanges || isBatchSubmitting) {
      return;
    }

    batch.cancelBatch();
  }, [batch, batchControlsVisible, isBatchSubmitting]);

  const batchControls = batchControlsVisible ? (
    <div className="psb-ui-table-batch-controls">
      <span className={`small ${batch.hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
        {batch.hasPendingChanges
          ? `Unsaved: ${batchDiff.newRows} new, ${batchDiff.modifiedRows} modified, ${batchDiff.removedRows} removed`
          : "No changes"}
      </span>
      <div className="psb-ui-table-batch-controls-actions">
        <button
          type="button"
          className="btn btn-success btn-sm"
          onClick={handleSaveBatch}
          disabled={!batch.hasPendingChanges || isBatchSubmitting}
        >
          {isBatchSubmitting ? "Saving..." : <><FontAwesomeIcon icon={faFloppyDisk} className="me-1" />Save Batch</>}
        </button>
        <button
          type="button"
          className="btn btn-light btn-sm"
          onClick={handleCancelBatch}
          disabled={!batch.hasPendingChanges || isBatchSubmitting}
        >
          <FontAwesomeIcon icon={faXmark} className="me-1" />Cancel Batch
        </button>
      </div>
    </div>
  ) : null;

  const handleRowAction = useCallback(
    ({ action, row, rowIndex }) => {
      tableState.emitChange({
        type: "action",
        action,
        row,
        rowIndex,
      });
    },
    [tableState],
  );

  const { handleAction } = useTableActions({
    batchMode,
    onBatchChange,
    batchApi: batch,
    onRowAction: controlledMode ? handleRowAction : undefined,
    rowIdKey,
  });

  const drag = useTableDragNDrop({
    draggable,
    onReorder,
    rows,
    rowIdKey,
    batchMode,
    batchApi: batch,
  });

  const sidePanelColumns = useMemo(
    () => buildSidePanelColumns({ actionColumnEnabled, normalizedColumns }),
    [actionColumnEnabled, normalizedColumns],
  );

  const sortingEnabled = useMemo(
    () => normalizedColumns.some((column) => column.sortable === true),
    [normalizedColumns],
  );

  const tableColSpan = visibleColumns.length + (actionColumnVisible ? 1 : 0);

  const handleUncontrolledSearchDebouncedChange = useCallback(
    (nextValue) => {
      if (controlledMode) {
        tableState.handleSearchDebouncedChange(nextValue);
        return;
      }

      const normalized = String(nextValue || "").trim();

      setUncontrolledFilters((previous) => {
        const next = {
          ...previous,
        };

        if (normalized) {
          next.search = normalized;
        } else {
          delete next.search;
        }

        return next;
      });
      setUncontrolledPage(1);
    },
    [controlledMode, tableState],
  );

  const handleFilterValueChange = useCallback(
    (filterKey, nextValue) => {
      if (controlledMode) {
        tableState.handleFilterValueChange(filterKey, nextValue);
        return;
      }

      setUncontrolledFilters((previous) => {
        const next = {
          ...previous,
          [filterKey]: nextValue,
        };

        if (isEmptyFilterValue(nextValue)) {
          delete next[filterKey];
        }

        return next;
      });
      setUncontrolledPage(1);
    },
    [controlledMode, tableState],
  );

  const handleSortToggle = useCallback(
    (column) => {
      if (!column?.sortable) {
        return;
      }

      if (controlledMode) {
        tableState.handleSortToggle(column);
        return;
      }

      setUncontrolledSorting((previous) => {
        const normalized = normalizeSortingState(previous);
        const nextDirection =
          normalized.key === column.key
            ? normalized.direction === "asc"
              ? "desc"
              : "asc"
            : "asc";

        return {
          key: column.key,
          direction: nextDirection,
        };
      });
      setUncontrolledPage(1);
    },
    [controlledMode, tableState],
  );

  const handleClearSorting = useCallback(() => {
    if (controlledMode) {
      tableState.handleClearSorting();
      return;
    }

    setUncontrolledSorting({ key: "", direction: "" });
  }, [controlledMode, tableState]);

  const effectiveSearchValue = controlledMode
    ? tableState.searchValue
    : String(uncontrolledFilters.search || "");
  const normalizedSearchQuery = String(effectiveSearchValue || "").trim().toLowerCase();

  const filteredRows = useMemo(() => {
    if (controlledMode) {
      return rows;
    }

    return rows.filter((row) => {
      if (normalizedSearchQuery) {
        const searchMatch = visibleColumns.some((column) => {
          const value = getNestedValue(row, column.key);
          return String(value ?? "").toLowerCase().includes(normalizedSearchQuery);
        });

        if (!searchMatch) {
          return false;
        }
      }

      for (const filter of tableState.normalizedFilterConfig) {
        if (!filter?.key || filter.key === "search") {
          continue;
        }

        const filterValue = effectiveFilters[filter.key];
        if (isEmptyFilterValue(filterValue)) {
          continue;
        }

        if (!matchesFilter(row, filter, filterValue)) {
          return false;
        }
      }

      return true;
    });
  }, [controlledMode, effectiveFilters, normalizedSearchQuery, rows, tableState.normalizedFilterConfig, visibleColumns]);

  const sortedRows = useMemo(() => {
    if (controlledMode || !effectiveSorting.key) {
      return filteredRows;
    }

    const direction = effectiveSorting.direction === "desc" ? -1 : 1;

    return filteredRows.slice().sort((left, right) => {
      const leftValue = getNestedValue(left, effectiveSorting.key);
      const rightValue = getNestedValue(right, effectiveSorting.key);
      return compareSortValues(leftValue, rightValue) * direction;
    });
  }, [controlledMode, effectiveSorting, filteredRows]);

  const effectiveTotal = controlledMode ? tableState.normalizedPagination.total : sortedRows.length;
  const effectivePageSize = hideFooter
    ? Math.max(effectiveTotal, 1)
    : controlledMode
      ? tableState.normalizedPagination.pageSize
      : Math.max(1, toIntegerOrFallback(uncontrolledPageSize, DEFAULT_PAGE_SIZE));
  const effectiveTotalPages = controlledMode
    ? tableState.totalPages
    : Math.max(1, Math.ceil(effectiveTotal / effectivePageSize));
  const requestedPage = controlledMode
    ? tableState.normalizedPagination.page
    : Math.max(1, toIntegerOrFallback(uncontrolledPage, 1));
  const safePage = Math.min(Math.max(1, requestedPage), effectiveTotalPages);

  useEffect(() => {
    if (controlledMode) {
      return;
    }

    if (safePage !== requestedPage) {
      setUncontrolledPage(safePage);
    }
  }, [controlledMode, requestedPage, safePage]);

  const displayRows = useMemo(() => {
    if (controlledMode) {
      return rows;
    }

    const start = (safePage - 1) * effectivePageSize;
    return sortedRows.slice(start, start + effectivePageSize);
  }, [controlledMode, effectivePageSize, rows, safePage, sortedRows]);

  const normalizedPageSizeOptions = useMemo(
    () => (controlledMode
      ? tableState.normalizedPageSizeOptions
      : normalizePageSizeOptions(pageSizeOptions, effectivePageSize)),
    [controlledMode, effectivePageSize, pageSizeOptions, tableState.normalizedPageSizeOptions],
  );

  const pageList = useMemo(
    () => (controlledMode ? tableState.pageList : buildPageList(safePage, effectiveTotalPages)),
    [controlledMode, effectiveTotalPages, safePage, tableState.pageList],
  );

  const firstVisibleIndex = effectiveTotal === 0 ? 0 : (safePage - 1) * effectivePageSize + 1;
  const lastVisibleIndex = effectiveTotal === 0 ? 0 : Math.min(effectiveTotal, safePage * effectivePageSize);

  const requestPage = useCallback(
    (nextPage, nextPageSize = effectivePageSize) => {
      if (controlledMode) {
        tableState.requestPage(nextPage, nextPageSize);
        return;
      }

      const safePageSize = Math.min(500, Math.max(1, toIntegerOrFallback(nextPageSize, effectivePageSize)));
      const boundedPage = Math.max(1, toIntegerOrFallback(nextPage, 1));

      setUncontrolledPageSize(safePageSize);
      setUncontrolledPage(boundedPage);
    },
    [controlledMode, effectivePageSize, tableState],
  );

  const handlePageSizeChange = useCallback(
    (event) => {
      const nextPageSize = Math.min(500, Math.max(1, toIntegerOrFallback(event.target.value, effectivePageSize)));
      requestPage(1, nextPageSize);
    },
    [effectivePageSize, requestPage],
  );

  const hasLocalFilters = useMemo(
    () => Object.entries(effectiveFilters).some(([key, value]) => key !== "search" && !isEmptyFilterValue(value)),
    [effectiveFilters],
  );

  const hasFilterControls = tableState.normalizedFilterConfig.length > 0;
  const localTransformsDisableDrag = !controlledMode
    && (normalizedSearchQuery !== "" || hasLocalFilters || effectiveSorting.key !== "" || displayRows.length !== rows.length);

  const renderCellContext = useCallback(
    ({ rowIndex, column }) => (controlledMode ? { rowIndex, column } : rowIndex),
    [controlledMode],
  );

  const tableBody = loading
    ? (
      <tbody>
        <tr>
          <td className="psb-ui-table-loading" colSpan={tableColSpan}>
            <span className="d-inline-flex align-items-center gap-2">
              <Spinner size="sm" animation="border" role="status" />
              <span>{loadingMessage}</span>
            </span>
          </td>
        </tr>
      </tbody>
    )
    : renderTableBody({
      rows: displayRows,
      rowIdKey,
      columns: visibleColumns,
      actionColumnVisible,
      actions,
      draggable: drag.canDrag && !localTransformsDisableDrag,
      rowIds: drag.rowIds,
      selectedRowId,
      onRowClick,
      onAction: handleAction,
      onUndoBatchAction,
      emptyMessage,
      emptyColSpan: tableColSpan,
      renderCellContext,
      emptyValue: controlledMode ? "-" : "--",
      striped: !controlledMode,
      batchDiff: batchDiffById,
      renderDetail,
    });

  const tableMarkup = (
    <BootstrapTable
      bordered
      hover
      className={tableClassName}
      style={{ width: "100%", tableLayout: "fixed" }}
    >
      <colgroup>
        {actionColumnVisible ? (
          <col
            className="psb-ui-table-actions-col"
            style={{
              width: `${actionColumnWidth}px`,
              minWidth: `${actionColumnWidth}px`,
            }}
          />
        ) : null}
        {visibleColumns.map((column) => (
          <col
            key={column.key}
            style={{
              width: `${getColumnWidth(column)}px`,
              minWidth: `${column.minWidth}px`,
            }}
          />
        ))}
      </colgroup>

      <thead onContextMenu={(event) => handleHeaderContextMenu(event, null)}>
        <tr>
          {actionColumnVisible ? (
            <th
              scope="col"
              className="psb-ui-table-actions-header"
              onContextMenu={(event) => handleHeaderContextMenu(event, null)}
            >
              <span className="psb-ui-table-header-label">Actions</span>
            </th>
          ) : null}

          {visibleColumns.map((column) => {
            const isSortedColumn = effectiveSorting.key === column.key;
            const sortIcon =
              !isSortedColumn
                ? faSort
                : effectiveSorting.direction === "asc"
                  ? faSortUp
                  : faSortDown;

            return (
              <th
                key={column.key}
                scope="col"
                style={{
                  width: `${getColumnWidth(column)}px`,
                  minWidth: `${column.minWidth}px`,
                  textAlign: column?.align || "left",
                  verticalAlign: "middle",
                }}
                className={column.resizable ? "psb-ui-table-th-resizable" : ""}
                onContextMenu={(event) => handleHeaderContextMenu(event, column)}
              >
                <div className="psb-ui-table-th-content">
                  {column.sortable ? (
                    <button
                      type="button"
                      className="psb-ui-table-sort-btn"
                      onClick={() => handleSortToggle(column)}
                      onContextMenu={(event) => handleHeaderContextMenu(event, column)}
                      aria-label={`Sort by ${column.label}`}
                    >
                      <span>{column.label}</span>
                      <FontAwesomeIcon icon={sortIcon} aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="psb-ui-table-header-label" onContextMenu={(event) => handleHeaderContextMenu(event, column)}>
                      {column.label}
                    </span>
                  )}

                  {column.resizable ? (
                    <span
                      className={[
                        "psb-ui-table-resizer",
                        activeResizeColumnKey === column.key ? "is-active" : "",
                      ].filter(Boolean).join(" ")}
                      onMouseDown={(event) => startResize(event, column)}
                      role="presentation"
                    />
                  ) : null}
                </div>
              </th>
            );
          })}
        </tr>
      </thead>

      {tableBody}
    </BootstrapTable>
  );

  const hasRows = displayRows.length > 0;
  const tableWithDrag = drag.wrapWithDragContext(tableMarkup, hasRows && !localTransformsDisableDrag);

  const searchShell = (
    <div className="psb-ui-table-search-shell">
      <SearchBar
        id={searchInputId}
        value={effectiveSearchValue}
        debounceMs={Math.max(0, toIntegerOrFallback(searchDebounceMs, DEFAULT_SEARCH_DEBOUNCE_MS))}
        className="psb-ui-table-search-input"
        placeholder={searchPlaceholder}
        onDebouncedChange={handleUncontrolledSearchDebouncedChange}
      />
    </div>
  );

  return (
    <section className={["psb-ui-table-shell", "psb-ui-table--setup", variantClassName, className].filter(Boolean).join(" ")} aria-label="Data table">
      {/* Batch Toolbar */}
      {batchControls}
      {/* Filter Toolbar */}
      {hasFilterControls ? (
        <div className={`psb-ui-table-filters-shell${filtersExpanded ? " psb-ui-table-filters-shell--inline" : ""}`}>
          <button
            type="button"
            className="psb-ui-table-filters-toggle"
            aria-expanded={filtersExpanded}
            onClick={() => setFiltersExpanded((current) => !current)}
          >
            <FontAwesomeIcon icon={filtersExpanded ? faChevronUp : faChevronDown} aria-hidden="true" />
            <span>Filters</span>
          </button>

          {filtersExpanded ? (
            <div className="psb-ui-table-filters" role="group" aria-label="Table filters">
              {tableState.normalizedFilterConfig.map((filter) => {
                const filterId = `${tableId}-filter-${filter.key}`;
                const filterValue = effectiveFilters[filter.key];

                if (filter.type === TABLE_FILTER_TYPES.SELECT) {
                  const options = normalizeFilterOptions(filter.options);

                  // Multi-select support when `filter.multiple === true`.
                  if (filter.multiple === true) {
                    const selectedValues = Array.isArray(filterValue) ? filterValue : [];

                    return (
                      <div key={filter.key} className="psb-ui-table-filter">
                        <Form.Label className="psb-ui-table-filter-label" htmlFor={filterId}>
                          {filter.label}
                        </Form.Label>
                        <MultiSelectDropdown
                          id={filterId}
                          options={options}
                          selectedValues={selectedValues}
                          onChange={(next) => handleFilterValueChange(filter.key, next)}
                          disabled={filter.loading === true}
                        />
                      </div>
                    );
                  }

                  const selectedValue = filterValue === undefined || filterValue === null ? "" : String(filterValue);

                  return (
                    <div key={filter.key} className="psb-ui-table-filter">
                      <Form.Label className="psb-ui-table-filter-label" htmlFor={filterId}>
                        {filter.label}
                      </Form.Label>
                      <Form.Select
                        id={filterId}
                        value={selectedValue}
                        disabled={filter.loading === true}
                        onChange={(event) => handleFilterValueChange(filter.key, event.target.value)}
                      >
                        <option value="">All</option>
                        {options.map((option, index) => (
                          <option key={`${filter.key}-${index}`} value={String(option.value ?? "")}>
                            {option.label}
                          </option>
                        ))}
                      </Form.Select>
                    </div>
                  );
                }

                if (filter.type === TABLE_FILTER_TYPES.DATE) {
                  return (
                    <div key={filter.key} className="psb-ui-table-filter">
                      <Form.Label className="psb-ui-table-filter-label" htmlFor={filterId}>
                        {filter.label}
                      </Form.Label>
                      <Form.Control
                        id={filterId}
                        type="date"
                        value={String(filterValue || "")}
                        onChange={(event) => handleFilterValueChange(filter.key, event.target.value)}
                      />
                    </div>
                  );
                }

                if (filter.type === TABLE_FILTER_TYPES.DATERANGE) {
                  const dateRange = getDateRangeValue(filterValue);

                  return (
                    <div key={filter.key} className="psb-ui-table-filter psb-ui-table-filter-range">
                      <Form.Label className="psb-ui-table-filter-label" htmlFor={`${filterId}-start`}>
                        {filter.label}
                      </Form.Label>
                      <div className="psb-ui-table-range-inputs">
                        <Form.Control
                          id={`${filterId}-start`}
                          type="date"
                          value={dateRange.start}
                          onChange={(event) =>
                            handleFilterValueChange(filter.key, {
                              start: event.target.value,
                              end: dateRange.end,
                            })
                          }
                        />
                        <Form.Control
                          id={`${filterId}-end`}
                          type="date"
                          value={dateRange.end}
                          onChange={(event) =>
                            handleFilterValueChange(filter.key, {
                              start: dateRange.start,
                              end: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={filter.key} className="psb-ui-table-filter">
                    <Form.Label className="psb-ui-table-filter-label" htmlFor={filterId}>
                      {filter.label}
                    </Form.Label>
                    <Form.Control
                      id={filterId}
                      type="text"
                      inputMode={filter.inputMode || "text"}
                      value={String(filterValue || "")}
                      onChange={(event) => {
                        let val = event.target.value;
                        if (filter.inputMode === "numeric") val = val.replace(/[^0-9.,$ x]/gi, "");
                        handleFilterValueChange(filter.key, val);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Search Toolbar */}
      {hideSearch ? null : searchShell}

      {/* Table Surface */}
      <div className="table-responsive">{tableWithDrag}</div>

      {/* Table Footer */}
      {hideFooter ? null : (
      <div className="psb-ui-table-pagination">
        <div className="psb-ui-table-pagination-summary">
          {effectiveTotal === 0
            ? "No records"
            : `Showing ${firstVisibleIndex}-${lastVisibleIndex} of ${effectiveTotal}`}
        </div>

        <div className="psb-ui-table-pagination-controls">
          <div className="psb-ui-table-page-size-wrap">
            <Form.Label htmlFor={`${tableId}-page-size`} className="psb-ui-table-filter-label mb-0">
              Rows
            </Form.Label>
            <Form.Select
              id={`${tableId}-page-size`}
              className="psb-ui-table-page-size-select"
              size="sm"
              value={String(effectivePageSize)}
              onChange={handlePageSizeChange}
            >
              {normalizedPageSizeOptions.map((option) => (
                <option key={option} value={String(option)}>
                  {option}
                </option>
              ))}
            </Form.Select>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={safePage <= 1}
            onClick={() => requestPage(safePage - 1)}
          >
            Prev
          </button>

          <div className="psb-ui-table-page-list" aria-label="Pagination">
            {pageList.map((entry, index) =>
              entry === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="psb-ui-table-page-ellipsis" aria-hidden="true">
                  ...
                </span>
              ) : (
                <button
                  key={`page-${entry}`}
                  type="button"
                  className={[
                    "psb-ui-table-page-btn",
                    entry === safePage ? "is-active" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => requestPage(Number(entry))}
                >
                  {entry}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={safePage >= effectiveTotalPages}
            onClick={() => requestPage(safePage + 1)}
          >
            Next
          </button>
        </div>
      </div>
      )}

      <TableContextMenuWrapper
        open={contextMenuState.open}
        position={{ x: contextMenuState.x, y: contextMenuState.y }}
        sorting={effectiveSorting}
        sortingEnabled={sortingEnabled}
        onCustomize={() => setSidePanelOpen(true)}
        onClearSorting={handleClearSorting}
        onClose={closeContextMenu}
      />

      <TableSidePanelWrapper
        open={sidePanelOpen}
        columns={sidePanelColumns}
        columnVisibility={columnVisibility}
        sorting={effectiveSorting}
        exportFormats={exportFormats}
        onToggleColumn={handleToggleColumnVisibility}
        onClearSorting={handleClearSorting}
        onExport={handleExport}
        onClose={() => setSidePanelOpen(false)}
      />
    </section>
  );
}
