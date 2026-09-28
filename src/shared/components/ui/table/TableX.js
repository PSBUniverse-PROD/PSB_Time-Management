"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TableZ from "@/shared/components/ui/table/TableZ";
import { createFilterConfig, TABLE_FILTER_TYPES } from "@/shared/components/ui/table/filterSchema";
import { databindQuery, databindOptions, databindExport } from "@/shared/utils/databind.actions";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatLabel(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function mapFilterType(type) {
  switch (String(type || "").toLowerCase()) {
    case "select":
      return TABLE_FILTER_TYPES.SELECT;
    case "date":
      return TABLE_FILTER_TYPES.DATE;
    case "daterange":
      return TABLE_FILTER_TYPES.DATERANGE;
    default:
      return TABLE_FILTER_TYPES.TEXT;
  }
}

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

/* ------------------------------------------------------------------ */
/*  TableX                                                            */
/* ------------------------------------------------------------------ */

export default function TableX({
  source,
  columns: rawColumns = [],
  filters: rawFilters = [],
  features = {},
  actions = [],
}) {
  const finalFeatures = {
    sorting: true,
    filtering: true,
    pagination: true,
    resizing: true,
    drag: false,
    batch: false,
    ...features,
  };

  /* ---- Columns --------------------------------------------------- */
  const columns = useMemo(
    () =>
      rawColumns.map((col) => {
        if (typeof col === "string") {
          return {
            key: col,
            label: formatLabel(col),
            sortable: finalFeatures.sorting,
          };
        }
        return {
          ...col,
          sortable: finalFeatures.sorting ? (col.sortable ?? true) : false,
        };
      }),
    [rawColumns, finalFeatures.sorting],
  );

  const fieldNames = useMemo(() => columns.map((c) => c.key), [columns]);

  /* ---- State ----------------------------------------------------- */
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterOptions, setFilterOptions] = useState({});

  const [tableState, setTableState] = useState(() => ({
    filters: {},
    sorting: { key: "", direction: "" },
    pagination: { page: 1, pageSize: 50, total: 0 },
    columnVisibility: {},
    columnSizing: {},
  }));

  /* ---- Filter config --------------------------------------------- */
  const filterConfig = useMemo(() => {
    if (!finalFeatures.filtering || !rawFilters.length) return [];
    return createFilterConfig(
      rawFilters.map((f) => ({
        key: f.key,
        label: f.label || formatLabel(f.key),
        type: mapFilterType(f.type),
        options: filterOptions[f.key] || [],
      })),
    );
  }, [finalFeatures.filtering, rawFilters, filterOptions]);

  /* ---- Fetch filter options once --------------------------------- */
  const optionsFetched = useRef(false);

  useEffect(() => {
    if (optionsFetched.current) return;
    const selectFilters = rawFilters.filter((f) => f.type === "select" && f.source);
    if (!selectFilters.length) return;
    optionsFetched.current = true;

    Promise.all(
      selectFilters.map(async (f) => {
        try {
          const data = await databindOptions({
            table: f.source,
            key: f.key,
            display: f.display,
          });
          return { field: f.key, options: data };
        } catch {
          return { field: f.key, options: [] };
        }
      }),
    ).then((results) => {
      const map = {};
      results.forEach((r) => { map[r.field] = r.options; });
      setFilterOptions(map);
    });
  }, [rawFilters]);

  /* ---- Fetch rows ------------------------------------------------ */
  useEffect(() => {
    if (!source || !fieldNames.length) return;
    setLoading(true);

    const activeFilters = {};
    for (const [k, v] of Object.entries(tableState.filters)) {
      if (k !== "search" && v !== "" && v !== null && v !== undefined) {
        activeFilters[k] = v;
      }
    }

    let active = true;

    databindQuery({
      table: source,
      fields: fieldNames,
      search: tableState.filters.search || "",
      searchFields: fieldNames,
      filters: activeFilters,
      sorting: tableState.sorting,
      page: tableState.pagination.page,
      pageSize: tableState.pagination.pageSize,
    })
      .then((payload) => {
        if (!active) return;
        setRows(payload.rows || []);
        setTableState((prev) => ({
          ...prev,
          pagination: {
            ...prev.pagination,
            total: toInt(payload.total, 0),
            page: toInt(payload.page, prev.pagination.page),
          },
        }));
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setRows([]);
        setError(err.message || "Failed to load data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [source, fieldNames, tableState.filters, tableState.sorting, tableState.pagination.page, tableState.pagination.pageSize]);

  /* ---- Export handler --------------------------------------------- */
  const columnLabelMap = useMemo(() => {
    const map = {};
    columns.forEach((c) => { map[c.key] = c.label; });
    return map;
  }, [columns]);

  const handleExport = useCallback(
    async (event) => {
      const format = String(event?.format || "csv").toLowerCase();
      const context = event?.context && typeof event.context === "object" ? event.context : {};
      const ctxFilters = context.filters && typeof context.filters === "object" ? context.filters : tableState.filters;
      const ctxSorting = context.sorting && typeof context.sorting === "object" ? context.sorting : tableState.sorting;
      const visibleKeys = Array.isArray(context.visibleColumnKeys) ? context.visibleColumnKeys : fieldNames;

      const activeFilters = {};
      for (const [k, v] of Object.entries(ctxFilters)) {
        if (k !== "search" && v !== "" && v !== null && v !== undefined) {
          activeFilters[k] = v;
        }
      }

      try {
        const result = await databindExport({
          table: source,
          format,
          columns: visibleKeys,
          columnLabels: columnLabelMap,
          search: ctxFilters.search || "",
          searchFields: fieldNames,
          filters: activeFilters,
          sorting: ctxSorting,
        });
        if (!result.ok) throw new Error(result.error || "Export failed.");

        const blob = new Blob([result.content], { type: result.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setError("Export failed.");
      }
    },
    [columnLabelMap, source, fieldNames, tableState.filters, tableState.sorting],
  );

  /* ---- Handle table events --------------------------------------- */
  const handleChange = useCallback(
    (event) => {
      const type = String(event?.type || "").toLowerCase();

      if (type === "filters") {
        setTableState((prev) => ({
          ...prev,
          filters: event.filters || {},
          pagination: { ...prev.pagination, page: 1 },
        }));
        return;
      }

      if (type === "search") {
        setTableState((prev) => {
          const next = { ...prev.filters };
          const value = String(event.value || "").trim();
          if (value) next.search = value;
          else delete next.search;
          return { ...prev, filters: next, pagination: { ...prev.pagination, page: 1 } };
        });
        return;
      }

      if (type === "sorting") {
        setTableState((prev) => ({
          ...prev,
          sorting: event.sorting || { key: "", direction: "" },
          pagination: { ...prev.pagination, page: 1 },
        }));
        return;
      }

      if (type === "pagination") {
        setTableState((prev) => ({
          ...prev,
          pagination: {
            ...prev.pagination,
            page: event.pagination?.page || 1,
            pageSize: event.pagination?.pageSize || prev.pagination.pageSize,
          },
        }));
        return;
      }

      if (type === "columnvisibility") {
        setTableState((prev) => ({ ...prev, columnVisibility: event.columnVisibility || {} }));
        return;
      }

      if (type === "columnresize") {
        setTableState((prev) => ({ ...prev, columnSizing: event.columnSizing || {} }));
        return;
      }

      if (type === "export") {
        handleExport(event);
        return;
      }

      if (type === "action") {
        if (typeof event?.action?.onClick === "function") {
          event.action.onClick(event.row);
        }
      }
    },
    [handleExport],
  );

  /* ---- Render ---------------------------------------------------- */
  return (
    <>
      {error && <p className="text-danger mb-2">{error}</p>}
      <TableZ
        data={rows}
        columns={columns}
        rowIdKey={rawColumns[0] || "id"}
        state={tableState}
        filterConfig={finalFeatures.filtering ? filterConfig : []}
        actions={actions}
        draggable={finalFeatures.drag}
        batchMode={finalFeatures.batch}
        loading={loading}
        onChange={handleChange}
      />
    </>
  );
}
