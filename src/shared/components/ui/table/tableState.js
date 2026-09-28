import { useCallback, useMemo } from "react";
import { createFilterConfig } from "@/shared/components/ui/table/filterSchema";
import {
  buildPageList,
  isEmptyFilterValue,
  normalizePageSizeOptions,
  toIntegerOrFallback,
} from "@/shared/components/ui/table/tableUtils";

function normalizePagination(rawPagination, fallbackPageSize) {
  const page = Math.max(1, toIntegerOrFallback(rawPagination?.page, 1));
  const pageSize = Math.max(1, toIntegerOrFallback(rawPagination?.pageSize, fallbackPageSize));
  const total = Math.max(0, toIntegerOrFallback(rawPagination?.total, 0));

  return {
    page,
    pageSize,
    total,
  };
}

function normalizeSortDirection(direction) {
  return String(direction || "").toLowerCase() === "desc" ? "desc" : "asc";
}

function normalizeSorting(rawSorting) {
  if (!rawSorting || typeof rawSorting !== "object" || Array.isArray(rawSorting)) {
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

export function useTableState({
  controlled = false,
  state,
  filterConfig = [],
  pageSizeOptions,
  defaultPageSize,
  onChange,
}) {
  const normalizedFilterConfig = useMemo(() => createFilterConfig(filterConfig), [filterConfig]);

  const filters = useMemo(() => {
    if (!controlled || !state || typeof state !== "object" || Array.isArray(state)) {
      return {};
    }

    return state.filters && typeof state.filters === "object" && !Array.isArray(state.filters)
      ? state.filters
      : {};
  }, [controlled, state]);

  const normalizedPagination = useMemo(
    () => normalizePagination(state?.pagination, defaultPageSize),
    [defaultPageSize, state?.pagination],
  );

  const normalizedSorting = useMemo(
    () => normalizeSorting(state?.sorting),
    [state?.sorting],
  );

  const searchValue = String(filters.search || "");

  const emitChange = useCallback(
    (event) => {
      if (!controlled || typeof onChange !== "function") {
        return;
      }

      onChange(event);
    },
    [controlled, onChange],
  );

  const handleSearchDebouncedChange = useCallback(
    (nextValue) => {
      emitChange({
        type: "search",
        value: String(nextValue || ""),
      });
    },
    [emitChange],
  );

  const handleFilterValueChange = useCallback(
    (filterKey, nextValue) => {
      const nextFilters = {
        ...filters,
        [filterKey]: nextValue,
      };

      if (isEmptyFilterValue(nextValue)) {
        delete nextFilters[filterKey];
      }

      emitChange({
        type: "filters",
        filters: nextFilters,
      });
    },
    [emitChange, filters],
  );

  const handleSortToggle = useCallback(
    (column) => {
      if (!controlled || !column?.sortable) {
        return;
      }

      const nextDirection =
        normalizedSorting.key === column.key
          ? normalizedSorting.direction === "asc"
            ? "desc"
            : "asc"
          : "asc";

      emitChange({
        type: "sorting",
        sorting: {
          key: column.key,
          direction: nextDirection,
        },
      });
    },
    [controlled, emitChange, normalizedSorting.direction, normalizedSorting.key],
  );

  const requestPage = useCallback(
    (nextPage, nextPageSize = normalizedPagination.pageSize) => {
      if (!controlled) {
        return;
      }

      const safePageSize = Math.min(500, Math.max(1, toIntegerOrFallback(nextPageSize, normalizedPagination.pageSize)));
      const boundedPage = Math.min(
        Math.max(1, toIntegerOrFallback(nextPage, 1)),
        Math.max(1, Math.ceil(normalizedPagination.total / safePageSize)),
      );

      emitChange({
        type: "pagination",
        pagination: {
          page: boundedPage,
          pageSize: safePageSize,
        },
      });
    },
    [controlled, emitChange, normalizedPagination.pageSize, normalizedPagination.total],
  );

  const handlePageSizeChange = useCallback(
    (event) => {
      if (!controlled) {
        return;
      }

      const nextPageSize = Math.min(
        500,
        Math.max(1, toIntegerOrFallback(event.target.value, normalizedPagination.pageSize)),
      );

      requestPage(1, nextPageSize);
    },
    [controlled, normalizedPagination.pageSize, requestPage],
  );

  const handleClearSorting = useCallback(() => {
    emitChange({
      type: "sorting",
      sorting: {
        key: "",
        direction: "",
      },
      reason: "clear",
    });
  }, [emitChange]);

  const normalizedPageSizeOptions = useMemo(
    () => normalizePageSizeOptions(pageSizeOptions, normalizedPagination.pageSize),
    [normalizedPagination.pageSize, pageSizeOptions],
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(normalizedPagination.total / normalizedPagination.pageSize)),
    [normalizedPagination.pageSize, normalizedPagination.total],
  );

  const safePage = useMemo(
    () => Math.min(Math.max(1, normalizedPagination.page), totalPages),
    [normalizedPagination.page, totalPages],
  );

  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  const firstVisibleIndex = normalizedPagination.total === 0 ? 0 : (safePage - 1) * normalizedPagination.pageSize + 1;
  const lastVisibleIndex =
    normalizedPagination.total === 0
      ? 0
      : Math.min(normalizedPagination.total, safePage * normalizedPagination.pageSize);

  return {
    normalizedFilterConfig,
    filters,
    normalizedPagination,
    normalizedSorting,
    searchValue,
    normalizedPageSizeOptions,
    totalPages,
    safePage,
    pageList,
    firstVisibleIndex,
    lastVisibleIndex,
    emitChange,
    handleSearchDebouncedChange,
    handleFilterValueChange,
    handleSortToggle,
    requestPage,
    handlePageSizeChange,
    handleClearSorting,
  };
}
