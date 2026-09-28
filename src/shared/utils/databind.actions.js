"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/;
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;
const MAX_EXPORT_ROWS = 10000;

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function validateTableName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed || !TABLE_NAME_PATTERN.test(trimmed)) {
    throw new Error(`Invalid table name: ${trimmed}`);
  }
  return trimmed;
}

function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return "*";
  const validated = fields.map((f) => String(f || "").trim()).filter((f) => FIELD_NAME_PATTERN.test(f));
  return validated.length > 0 ? validated.join(",") : "*";
}

function buildSearchFilter(search, searchFields) {
  const term = String(search || "").trim();
  if (!term) return null;
  const fields = Array.isArray(searchFields) ? searchFields : [];
  const valid = fields.map((f) => String(f || "").trim()).filter((f) => FIELD_NAME_PATTERN.test(f));
  if (!valid.length) return null;
  return valid.map((f) => `${f}.ilike.%${term}%`).join(",");
}

function applyFilters(query, filters) {
  for (const [field, value] of Object.entries(filters)) {
    if (!FIELD_NAME_PATTERN.test(field)) continue;
    if (value && typeof value === "object" && (value.start || value.end)) {
      if (value.start) query = query.gte(field, value.start);
      if (value.end) query = query.lte(field, value.end);
    } else if (value !== "" && value !== null && value !== undefined) {
      query = query.eq(field, value);
    }
  }
  return query;
}

function applySorting(query, sorting) {
  const sortKey = String(sorting?.key || "").trim();
  if (sortKey && FIELD_NAME_PATTERN.test(sortKey)) {
    const ascending = String(sorting?.direction || "").toLowerCase() !== "desc";
    query = query.order(sortKey, { ascending });
  }
  return query;
}

function escapeCsvValue(value, delimiter) {
  const raw = String(value ?? "");
  if (delimiter === "\t") return raw.replace(/\t/g, " ").replace(/\r?\n/g, " ");
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

// ── query ──────────────────────────────────────────────────
export async function databindQuery(body = {}) {
  try {
    const table = validateTableName(body.table);
    const selectFields = validateFields(body.fields);
    const search = String(body.search || "").trim();
    const searchFields = body.searchFields;
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const sorting = body.sorting && typeof body.sorting === "object" ? body.sorting : {};
    const page = Math.max(1, toInt(body.page, 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(body.pageSize, DEFAULT_PAGE_SIZE)));

    const supabase = getSupabaseAdmin();
    let query = supabase.from(table).select(selectFields, { count: "exact" });

    const searchFilter = buildSearchFilter(search, searchFields);
    if (searchFilter) query = query.or(searchFilter);
    query = applyFilters(query, filters);
    query = applySorting(query, sorting);

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, count, error } = await query;
    if (error) return { ok: false, rows: [], total: 0, page, pageSize, error: error.message };
    return { ok: true, rows: data || [], total: count || 0, page, pageSize };
  } catch (err) {
    return { ok: false, rows: [], total: 0, page: 1, pageSize: 50, error: err.message };
  }
}

// ── options ────────────────────────────────────────────────
export async function databindOptions(body = {}) {
  try {
    const table = String(body.table || "").trim();
    const key = String(body.key || "").trim();
    const display = String(body.display || "").trim();
    if (!table || !TABLE_NAME_PATTERN.test(table)) return [];
    if (!key || !FIELD_NAME_PATTERN.test(key)) return [];
    if (!display || !FIELD_NAME_PATTERN.test(display)) return [];

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from(table).select(`${key},${display}`).order(display, { ascending: true });
    if (error) return [];
    return (data || []).map((row) => ({ value: row[key], label: String(row[display] ?? row[key] ?? "") }));
  } catch {
    return [];
  }
}

// ── export ─────────────────────────────────────────────────
export async function databindExport(body = {}) {
  try {
    const table = validateTableName(body.table);
    const format = String(body.format || "csv").toLowerCase() === "excel" ? "excel" : "csv";
    const columnKeys = Array.isArray(body.columns)
      ? body.columns.map((f) => String(f || "").trim()).filter((f) => FIELD_NAME_PATTERN.test(f)) : [];
    const columnLabels = body.columnLabels && typeof body.columnLabels === "object" ? body.columnLabels : {};
    const search = String(body.search || "").trim();
    const searchFields = body.searchFields;
    const filters = body.filters && typeof body.filters === "object" ? body.filters : {};
    const sorting = body.sorting && typeof body.sorting === "object" ? body.sorting : {};

    const selectFields = columnKeys.length > 0 ? columnKeys.join(",") : "*";
    const supabase = getSupabaseAdmin();
    let query = supabase.from(table).select(selectFields).limit(MAX_EXPORT_ROWS);

    const searchFilter = buildSearchFilter(search, searchFields);
    if (searchFilter) query = query.or(searchFilter);
    query = applyFilters(query, filters);
    query = applySorting(query, sorting);

    const { data, error } = await query;
    if (error) return { ok: false, error: error.message };

    const rows = data || [];
    const exportColumns = columnKeys.length > 0 ? columnKeys : rows.length > 0 ? Object.keys(rows[0]) : [];
    const delimiter = format === "excel" ? "\t" : ",";
    const header = exportColumns.map((k) => escapeCsvValue(columnLabels[k] || k, delimiter)).join(delimiter);
    const dataLines = rows.map((r) => exportColumns.map((k) => escapeCsvValue(r[k], delimiter)).join(delimiter));
    const ext = format === "excel" ? "xls" : "csv";
    const ts = new Date().toISOString().slice(0, 10);

    return {
      ok: true,
      content: [header, ...dataLines].join("\n"),
      fileName: `${table}-export-${ts}.${ext}`,
      mimeType: format === "excel" ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8",
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── schema ─────────────────────────────────────────────────
export async function databindSchema(tableName = "") {
  try {
    const trimmed = String(tableName || "").trim();
    if (!trimmed || !TABLE_NAME_PATTERN.test(trimmed)) {
      return { ok: false, columns: [], error: "Invalid table name" };
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from(trimmed).select("*").limit(1);
    if (error) return { ok: false, columns: [], error: error.message };
    const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
    return { ok: true, table: trimmed, columns };
  } catch (err) {
    return { ok: false, columns: [], error: err.message };
  }
}
