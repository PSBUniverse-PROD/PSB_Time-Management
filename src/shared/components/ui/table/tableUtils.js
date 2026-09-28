export const DEFAULT_SEARCH_DEBOUNCE_MS = 350;
export const DEFAULT_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100, 500];
export const DEFAULT_MIN_COLUMN_WIDTH = 96;
export const ACTION_COLUMN_VISIBILITY_KEY = "__psb_action_column__";

export const BATCH_TYPE_CREATED = "create";
export const BATCH_TYPE_UPDATED = "update";
export const BATCH_TYPE_DELETED = "delete";

export const BATCH_STATE_NONE = "none";
export const BATCH_STATE_CREATED = "created";
export const BATCH_STATE_UPDATED = "updated";
export const BATCH_STATE_DELETED = "deleted";
export const BATCH_STATE_HARD_DELETED = "hardDeleted";
export const BATCH_STATE_REORDERED = "reordered";

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toIntegerOrFallback(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export function isEmptyFilterValue(value) {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (isPlainObject(value)) {
    return Object.values(value).every((entry) => isEmptyFilterValue(entry));
  }

  return false;
}

export function getDateRangeValue(rawValue) {
  if (!isPlainObject(rawValue)) {
    return {
      start: "",
      end: "",
    };
  }

  return {
    start: String(rawValue.start || ""),
    end: String(rawValue.end || ""),
  };
}

export function normalizeFilterOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (isPlainObject(option)) {
      return {
        label: String(option.label ?? option.value ?? ""),
        value: option.value,
      };
    }

    return {
      label: String(option),
      value: option,
    };
  });
}

export function getNestedValue(target, path) {
  if (!target || !path) {
    return undefined;
  }

  return String(path)
    .split(".")
    .reduce((acc, segment) => (acc === undefined || acc === null ? undefined : acc[segment]), target);
}

export function normalizeBatchType(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return "";
  if (raw === BATCH_TYPE_CREATED || raw === BATCH_STATE_CREATED || raw === "new") return BATCH_TYPE_CREATED;
  if (raw === BATCH_TYPE_UPDATED || raw === BATCH_STATE_UPDATED || raw === "edited") return BATCH_TYPE_UPDATED;
  if (raw === BATCH_TYPE_DELETED || raw === BATCH_STATE_DELETED || raw === "deactivated") return BATCH_TYPE_DELETED;

  return "";
}

function inferBatchTypeFromText(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw) return "";
  if (/(delete|deactivate|remove|archive)/.test(raw)) return BATCH_TYPE_DELETED;
  if (/(create|add|new)/.test(raw)) return BATCH_TYPE_CREATED;
  if (/(edit|update|toggle|enable|disable|save)/.test(raw)) return BATCH_TYPE_UPDATED;

  return "";
}

export function resolveBatchTypeFromAction(action) {
  const explicitType = normalizeBatchType(
    action?.batchType
    || action?.batchEventType
    || action?.mutationType
    || action?.intent,
  );

  if (explicitType) {
    return explicitType;
  }

  const inferredType = inferBatchTypeFromText(`${action?.key || ""} ${action?.label || ""}`);
  return inferredType || BATCH_TYPE_UPDATED;
}

export function normalizeBatchState(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (!raw || raw === BATCH_STATE_NONE) return BATCH_STATE_NONE;
  if (raw === BATCH_STATE_CREATED || raw === "new") return BATCH_STATE_CREATED;
  if (raw === BATCH_STATE_UPDATED || raw === "edited") return BATCH_STATE_UPDATED;
  if (raw === BATCH_STATE_DELETED || raw === "deactivated") return BATCH_STATE_DELETED;
  if (raw === BATCH_STATE_HARD_DELETED || raw === "harddeleted") return BATCH_STATE_HARD_DELETED;
  if (raw === BATCH_STATE_REORDERED) return BATCH_STATE_REORDERED;

  return BATCH_STATE_NONE;
}

export function resolveNextBatchState(currentBatchState, batchType) {
  const normalizedState = normalizeBatchState(currentBatchState);
  const normalizedType = normalizeBatchType(batchType);

  if (normalizedType === BATCH_TYPE_CREATED) {
    return BATCH_STATE_CREATED;
  }

  if (normalizedType === BATCH_TYPE_DELETED) {
    return BATCH_STATE_DELETED;
  }

  if (normalizedType === BATCH_TYPE_UPDATED) {
    return normalizedState === BATCH_STATE_CREATED ? BATCH_STATE_CREATED : BATCH_STATE_UPDATED;
  }

  return normalizedState;
}

export function resolveBatchClassName(batchState) {
  const normalizedState = normalizeBatchState(batchState);

  if (normalizedState === BATCH_STATE_CREATED) return "psb-row-created";
  if (normalizedState === BATCH_STATE_UPDATED) return "psb-row-updated";
  if (normalizedState === BATCH_STATE_DELETED) return "psb-row-deleted";
  if (normalizedState === BATCH_STATE_HARD_DELETED) return "psb-row-deleted";
  if (normalizedState === BATCH_STATE_REORDERED) return "psb-row-updated";

  return "";
}

export function resolveBatchDiffClassName(diffEntry) {
  if (!diffEntry) return "";
  if (diffEntry.isPendingRemove) return "psb-row-pending-remove";
  if (diffEntry.isNew) return "psb-row-new";
  if (diffEntry.isChanged) return "psb-row-modified";
  return "";
}

export function resolveCellDiffClassName(diffEntry, columnKey) {
  if (!diffEntry || !columnKey) return "";
  if (diffEntry.isPendingRemove) return "";
  if (diffEntry.changedColumns && diffEntry.changedColumns.has(columnKey)) return "psb-cell-changed";
  return "";
}

export function toRowId(row, rowIdKey, index) {
  const value = row?.[rowIdKey];
  return value === undefined || value === null || value === "" ? `row-${index}` : String(value);
}

export function normalizePageSizeOptions(pageSizeOptions, currentPageSize) {
  const values = Array.isArray(pageSizeOptions) ? pageSizeOptions : DEFAULT_PAGE_SIZE_OPTIONS;

  const uniqueValues = new Set(
    values
      .map((value) => toIntegerOrFallback(value, 0))
      .filter((value) => value > 0 && value <= 500),
  );

  uniqueValues.add(Math.min(500, Math.max(1, toIntegerOrFallback(currentPageSize, DEFAULT_PAGE_SIZE))));

  return Array.from(uniqueValues).sort((left, right) => left - right);
}

export function buildPageList(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pageSet = new Set([1, totalPages, page, page - 1, page + 1, page - 2, page + 2]);
  const sortedPages = Array.from(pageSet)
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((left, right) => left - right);

  const result = [];

  sortedPages.forEach((candidate, index) => {
    const previous = sortedPages[index - 1];

    if (index > 0 && previous + 1 < candidate) {
      result.push("ellipsis");
    }

    result.push(candidate);
  });

  return result;
}

export function stripBatchState(row) {
  return {
    ...(row || {}),
    __batchState: BATCH_STATE_NONE,
  };
}

export function withNormalizedBatchState(row) {
  return {
    ...(row || {}),
    __batchState: normalizeBatchState(row?.__batchState),
  };
}
