"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, StatusBadge, toastError, toastInfo, toastSuccess, toastWarning } from "@/shared/components/ui";
import { createFilterConfig, TABLE_FILTER_TYPES } from "@/shared/components/ui/table/filterSchema";
import {
  getDataTableFilterOptions,
  queryDataTableRows,
  exportDataTable,
} from "../../data/dataTableExample.actions";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100, 500];
const DEFAULT_PAGE_SIZE = 50;
const COLUMN_VISIBILITY_STORAGE_PREFIX = "psb:data-table:column-visibility:";
const COLUMN_SIZING_STORAGE_PREFIX = "psb:data-table:column-sizing:";

const DATA_TABLE_COLUMNS = [
  {
    key: "employee_code",
    label: "Employee Code",
    sortable: true,
    width: 150,
  },
  {
    key: "full_name",
    label: "Name",
    sortable: true,
    width: 220,
  },
  {
    key: "email",
    label: "Email",
    sortable: true,
    width: 270,
  },
  {
    key: "team",
    label: "Team",
    sortable: true,
    width: 160,
  },
  {
    key: "role",
    label: "Role",
    sortable: true,
    width: 150,
    render: (row) => (
      <Badge bg={roleBadgeBackground(row.role)} text={row.role === "viewer" ? "dark" : "light"}>
        {row.role_label || row.role}
      </Badge>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    width: 150,
    render: (row) => (
      <StatusBadge status={row.status} label={row.status_label || undefined} />
    ),
  },
  {
    key: "created_at",
    label: "Created",
    sortable: true,
    width: 160,
  },
];

const FILTER_CONFIG_TEMPLATE = createFilterConfig([
  {
    key: "status",
    label: "Status",
    type: TABLE_FILTER_TYPES.SELECT,
    options: [],
  },
  {
    key: "role",
    label: "Role",
    type: TABLE_FILTER_TYPES.SELECT,
    options: [],
  },
  {
    key: "created_at",
    label: "Created Date",
    type: TABLE_FILTER_TYPES.DATERANGE,
  },
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toIntegerOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .filter((option) => option && typeof option === "object")
    .map((option) => ({
      label: String(option.label ?? option.value ?? ""),
      value: option.value,
    }))
    .filter((option) => String(option.label).trim() !== "");
}

function statusBadgeBackground(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "success";
  if (value === "inactive") return "secondary";
  if (value === "pending") return "warning";
  return "dark";
}

function roleBadgeBackground(role) {
  const value = String(role || "").toLowerCase();
  if (value === "admin") return "danger";
  if (value === "manager") return "primary";
  if (value === "analyst") return "info";
  return "light";
}

function parseFileName(contentDispositionHeader) {
  const rawHeader = String(contentDispositionHeader || "").trim();
  if (!rawHeader) {
    return "";
  }

  const utf8Match = rawHeader.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const fallbackMatch = rawHeader.match(/filename=\"?([^\";]+)\"?/i);
  return fallbackMatch?.[1] || "";
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function normalizeSorting(rawSorting) {
  if (!isPlainObject(rawSorting)) {
    return {
      key: "",
      direction: "",
    };
  }

  const key = String(rawSorting.key || "").trim();
  const direction = String(rawSorting.direction || "").trim().toLowerCase();

  if (!key) {
    return {
      key: "",
      direction: "",
    };
  }

  return {
    key,
    direction: direction === "desc" ? "desc" : "asc",
  };
}

function normalizePagination(rawPagination) {
  return {
    page: Math.max(1, toIntegerOrFallback(rawPagination?.page, 1)),
    pageSize: Math.min(500, Math.max(1, toIntegerOrFallback(rawPagination?.pageSize, DEFAULT_PAGE_SIZE))),
    total: Math.max(0, toIntegerOrFallback(rawPagination?.total, 0)),
  };
}

function getColumnVisibilityStorageKey(userScope) {
  const scope = String(userScope || "anonymous").trim().toLowerCase();
  return `${COLUMN_VISIBILITY_STORAGE_PREFIX}${scope || "anonymous"}`;
}

function getColumnSizingStorageKey(userScope) {
  const scope = String(userScope || "anonymous").trim().toLowerCase();
  return `${COLUMN_SIZING_STORAGE_PREFIX}${scope || "anonymous"}`;
}

function getDefaultColumnVisibility(columns) {
  return columns.reduce((acc, column) => {
    acc[column.key] = column.visible !== false;
    return acc;
  }, {});
}

function getDefaultColumnSizing(columns) {
  return columns.reduce((acc, column) => {
    const width = Math.max(96, toIntegerOrFallback(column.width, 140));
    acc[column.key] = width;
    return acc;
  }, {});
}

function sanitizeColumnVisibility(rawVisibility, columns) {
  const fallback = getDefaultColumnVisibility(columns);

  if (!isPlainObject(rawVisibility)) {
    return fallback;
  }

  const sanitized = { ...fallback };

  Object.keys(rawVisibility).forEach((key) => {
    const normalizedKey = String(key || "").trim();

    if (!normalizedKey) {
      return;
    }

    sanitized[normalizedKey] = rawVisibility[normalizedKey] !== false;
  });

  columns.forEach((column) => {
    sanitized[column.key] = rawVisibility[column.key] !== false;
  });

  const visibleCount = Object.values(sanitized).filter(Boolean).length;

  if (visibleCount === 0 && columns.length > 0) {
    sanitized[columns[0].key] = true;
  }

  return sanitized;
}

function readColumnVisibility(userScope, columns) {
  if (typeof window === "undefined") {
    return getDefaultColumnVisibility(columns);
  }

  try {
    const raw = window.localStorage.getItem(getColumnVisibilityStorageKey(userScope));

    if (!raw) {
      return getDefaultColumnVisibility(columns);
    }

    return sanitizeColumnVisibility(JSON.parse(raw), columns);
  } catch {
    return getDefaultColumnVisibility(columns);
  }
}

function sanitizeColumnSizing(rawSizing, columns) {
  const fallback = getDefaultColumnSizing(columns);

  if (!isPlainObject(rawSizing)) {
    return fallback;
  }

  const sanitized = { ...fallback };

  columns.forEach((column) => {
    const nextWidth = toIntegerOrFallback(rawSizing[column.key], fallback[column.key]);
    sanitized[column.key] = Math.max(96, nextWidth);
  });

  return sanitized;
}

function readColumnSizing(userScope, columns) {
  if (typeof window === "undefined") {
    return getDefaultColumnSizing(columns);
  }

  try {
    const raw = window.localStorage.getItem(getColumnSizingStorageKey(userScope));

    if (!raw) {
      return getDefaultColumnSizing(columns);
    }

    return sanitizeColumnSizing(JSON.parse(raw), columns);
  } catch {
    return getDefaultColumnSizing(columns);
  }
}

function writeColumnVisibility(userScope, visibilityMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getColumnVisibilityStorageKey(userScope), JSON.stringify(visibilityMap));
  } catch {
    // Ignore localStorage write failures to keep UI responsive.
  }
}

function writeColumnSizing(userScope, columnSizing) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getColumnSizingStorageKey(userScope), JSON.stringify(columnSizing));
  } catch {
    // Ignore localStorage write failures to keep UI responsive.
  }
}

function appendFiltersToQuery(searchParams, filters) {
  const search = String(filters?.search || "").trim();
  if (search) {
    searchParams.set("search", search);
  }

  const status = String(filters?.status || "").trim();
  if (status) {
    searchParams.set("status", status);
  }

  const role = String(filters?.role || "").trim();
  if (role) {
    searchParams.set("role", role);
  }

  if (isPlainObject(filters?.created_at)) {
    const start = String(filters.created_at.start || "").trim();
    const end = String(filters.created_at.end || "").trim();

    if (start) {
      searchParams.set("createdStart", start);
    }

    if (end) {
      searchParams.set("createdEnd", end);
    }
  }
}

export function useDataTableModuleController({ userScope }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(true);
  const [statusOptions, setStatusOptions] = useState([]);
  const [roleOptions, setRoleOptions] = useState([]);

  const [tableState, setTableState] = useState(() => ({
    filters: {},
    sorting: {
      key: "created_at",
      direction: "desc",
    },
    pagination: {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      total: 0,
    },
    columnVisibility: readColumnVisibility(userScope, DATA_TABLE_COLUMNS),
    columnSizing: readColumnSizing(userScope, DATA_TABLE_COLUMNS),
  }));

  const filterConfig = useMemo(
    () =>
      FILTER_CONFIG_TEMPLATE.map((filter) => {
        if (filter.key === "status") {
          return {
            ...filter,
            options: statusOptions,
            loading: filterOptionsLoading,
          };
        }

        if (filter.key === "role") {
          return {
            ...filter,
            options: roleOptions,
            loading: filterOptionsLoading,
          };
        }

        return filter;
      }),
    [filterOptionsLoading, roleOptions, statusOptions],
  );

  const actions = useMemo(
    () => [
      {
        key: "preview",
        label: "Preview",
        type: "primary",
        icon: "eye",
        visible: () => true,
        disabled: () => false,
        onClick: (row) => {
          toastInfo(`Preview requested for ${row.employee_code}.`);
        },
      },
      {
        key: "edit",
        label: "Edit",
        type: "secondary",
        icon: "pen",
        visible: (row) => row.status === "active",
        disabled: (row) => row.role === "admin",
        onClick: (row) => {
          toastSuccess(`Edit flow opened for ${row.full_name}.`, "Edit");
        },
      },
      {
        key: "deactivate",
        label: "Deactivate",
        type: "secondary",
        icon: "ban",
        visible: (row) => row.status === "active",
        disabled: (row) => row.role === "admin",
        confirm: true,
        confirmMessage: (row) => `Deactivate ${row.full_name}?`,
        onClick: (row) => {
          toastWarning(`Deactivation queued for ${row.full_name}.`, "Queued");
        },
      },
    ],
    [],
  );

  const requestState = useMemo(
    () => ({
      filters: isPlainObject(tableState.filters) ? tableState.filters : {},
      sorting: normalizeSorting(tableState.sorting),
      page: Math.max(1, toIntegerOrFallback(tableState.pagination?.page, 1)),
      pageSize: Math.min(500, Math.max(1, toIntegerOrFallback(tableState.pagination?.pageSize, DEFAULT_PAGE_SIZE))),
    }),
    [tableState.filters, tableState.pagination?.page, tableState.pagination?.pageSize, tableState.sorting],
  );

  const loadFilterOptions = useCallback(async () => {
    return getDataTableFilterOptions();
  }, []);

  const fetchRows = useCallback(
    async () => {
      const params = {
        page: requestState.page,
        pageSize: requestState.pageSize,
        sortKey: requestState.sorting.key || "",
        sortDirection: requestState.sorting.direction || "desc",
        search: requestState.filters.search || "",
        status: requestState.filters.status || "",
        role: requestState.filters.role || "",
        createdStart: requestState.filters.createdStart || "",
        createdEnd: requestState.filters.createdEnd || "",
      };

      return queryDataTableRows(params);
    },
    [requestState.filters, requestState.page, requestState.pageSize, requestState.sorting.direction, requestState.sorting.key],
  );

  useEffect(() => {
    let active = true;

    loadFilterOptions()
      .then((payload) => {
        if (!active) {
          return;
        }

        setStatusOptions(normalizeOptions(payload?.statusOptions));
        setRoleOptions(normalizeOptions(payload?.roleOptions));
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setStatusOptions([]);
        setRoleOptions([]);
        toastError("Unable to load filter options for the data table module.");
      })
      .finally(() => {
        if (active) {
          setFilterOptionsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadFilterOptions]);

  useEffect(() => {
    let active = true;

    fetchRows()
      .then((payload) => {
        if (!active) return;

        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const nextTotal = Math.max(0, toIntegerOrFallback(payload?.total, 0));
        const nextPage = Math.max(1, toIntegerOrFallback(payload?.page, requestState.page));
        const nextPageSize = Math.min(500, Math.max(1, toIntegerOrFallback(payload?.pageSize, requestState.pageSize)));

        setRows(nextRows);

        setTableState((previous) => ({
          ...previous,
          pagination: {
            ...previous.pagination,
            total: nextTotal,
            page: nextPage,
            pageSize: nextPageSize,
          },
        }));
      })
      .catch((error) => {
        if (!active) return;

        setRows([]);

        setTableState((previous) => ({
          ...previous,
          pagination: {
            ...previous.pagination,
            total: 0,
          },
        }));

        const message = error instanceof Error ? error.message : "Unable to load rows from server.";
        setErrorText(message);
        toastError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fetchRows, requestState.page, requestState.pageSize]);

  const exportFromServer = useCallback(
    async (event) => {
      const selectedFormat = String(event?.format || "csv").toLowerCase();
      const context = isPlainObject(event?.context) ? event.context : {};

      const contextFilters = isPlainObject(context.filters) ? context.filters : tableState.filters;
      const contextSorting = normalizeSorting(context.sorting || tableState.sorting);
      const contextPagination = normalizePagination(context.pagination || tableState.pagination);
      const visibleColumnKeys = Array.isArray(context.visibleColumnKeys)
        ? context.visibleColumnKeys.map((key) => String(key || "").trim()).filter(Boolean)
        : [];

      const exportResult = await exportDataTable({
        format: selectedFormat,
        scope: "all-filtered",
        page: contextPagination.page,
        pageSize: contextPagination.pageSize,
        sortKey: contextSorting.key || "",
        sortDirection: contextSorting.direction || "desc",
        search: contextFilters.search || "",
        status: contextFilters.status || "",
        role: contextFilters.role || "",
        createdStart: contextFilters.createdStart || "",
        createdEnd: contextFilters.createdEnd || "",
        columns: visibleColumnKeys.length > 0 ? visibleColumnKeys : undefined,
      });

      const blob = new Blob([exportResult.content], { type: exportResult.mimeType });
      downloadBlob(blob, exportResult.fileName);
      toastSuccess(`${exportResult.fileName} downloaded.`, "Export ready");
    },
    [tableState.filters, tableState.pagination, tableState.sorting],
  );

  const handleTableChange = useCallback(
    (event) => {
      const eventType = String(event?.type || "").trim().toLowerCase();

      if (eventType === "filters") {
        const nextFilters = isPlainObject(event.filters) ? event.filters : {};

        setErrorText("");
        setLoading(true);
        setTableState((previous) => ({
          ...previous,
          filters: nextFilters,
          pagination: {
            ...previous.pagination,
            page: 1,
          },
        }));

        return;
      }

      if (eventType === "search") {
        const nextSearch = String(event.value || "").trim();

        setErrorText("");
        setLoading(true);
        setTableState((previous) => {
          const nextFilters = {
            ...previous.filters,
          };

          if (nextSearch) {
            nextFilters.search = nextSearch;
          } else {
            delete nextFilters.search;
          }

          return {
            ...previous,
            filters: nextFilters,
            pagination: {
              ...previous.pagination,
              page: 1,
            },
          };
        });

        return;
      }

      if (eventType === "sorting") {
        const nextSorting = normalizeSorting(event.sorting);

        setErrorText("");
        setLoading(true);
        setTableState((previous) => ({
          ...previous,
          sorting: nextSorting,
          pagination: {
            ...previous.pagination,
            page: 1,
          },
        }));

        return;
      }

      if (eventType === "pagination") {
        const nextPagination = normalizePagination(event.pagination);

        setErrorText("");
        setLoading(true);
        setTableState((previous) => ({
          ...previous,
          pagination: {
            ...previous.pagination,
            page: nextPagination.page,
            pageSize: nextPagination.pageSize,
          },
        }));

        return;
      }

      if (eventType === "columnvisibility") {
        const nextVisibility = sanitizeColumnVisibility(event.columnVisibility, DATA_TABLE_COLUMNS);

        setTableState((previous) => ({
          ...previous,
          columnVisibility: nextVisibility,
        }));

        writeColumnVisibility(userScope, nextVisibility);
        return;
      }

      if (eventType === "columnresize") {
        const nextSizing = sanitizeColumnSizing(event.columnSizing, DATA_TABLE_COLUMNS);

        setTableState((previous) => ({
          ...previous,
          columnSizing: nextSizing,
        }));

        writeColumnSizing(userScope, nextSizing);
        return;
      }

      if (eventType === "export") {
        exportFromServer(event).catch((error) => {
          const message = error instanceof Error ? error.message : "Export failed.";
          toastError(message);
        });

        return;
      }

      if (eventType === "action") {
        if (typeof event?.action?.onClick === "function") {
          event.action.onClick(event.row);
        }
      }
    },
    [exportFromServer, userScope],
  );

  return {
    rows,
    loading,
    errorText,
    columns: DATA_TABLE_COLUMNS,
    filterConfig,
    actions,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    tableState,
    handleTableChange,
  };
}
