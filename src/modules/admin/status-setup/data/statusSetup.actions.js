"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function sanitizeOptionalText(value) {
  const text = normalizeText(value);
  return text === "" ? null : text;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return !(text === "false" || text === "0" || text === "n" || text === "no" || text === "f");
}

const STATUS_NAME_FIELDS = ["sts_name", "status_name", "name"];
const STATUS_DESC_FIELDS = ["sts_desc", "status_desc", "description"];

function resolveWritableField(row, candidates, fallback = null) {
  for (const candidate of candidates) {
    if (row && hasOwn(row, candidate)) return candidate;
  }
  return fallback;
}

function buildStatusPayloadFromInput(input, sampleRow) {
  const payload = {};
  const nameField = resolveWritableField(sampleRow, STATUS_NAME_FIELDS, "sts_name");
  const descField = resolveWritableField(sampleRow, STATUS_DESC_FIELDS, "sts_desc");

  if (hasOwn(input, "sts_name")) {
    const name = normalizeText(input.sts_name);
    if (!name) throw new Error("Status name is required.");
    if (!nameField) throw new Error("Unable to resolve status name field.");
    payload[nameField] = name;
  }
  if (hasOwn(input, "sts_desc") && descField) {
    payload[descField] = sanitizeOptionalText(input.sts_desc);
  }
  if (hasOwn(input, "is_active")) {
    payload.is_active = normalizeBoolean(input.is_active);
  }
  return payload;
}

function assertValidPayload(payload, message) {
  if (!payload || Object.keys(payload).length === 0) throw new Error(message);
}

// ─── SERVER ACTIONS (called from client) ───────────────────

export async function loadStatusSetupData() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("psb_s_status")
    .select("*")
    .order("status_id", { ascending: true });

  if (error) throw new Error(error.message || "Failed to fetch statuses");
  return { statuses: Array.isArray(data) ? data : [] };
}

export async function createStatusAction(payload) {
  const supabase = getSupabaseAdmin();
  const { data: statuses } = await supabase.from("psb_s_status").select("*").limit(1);
  const sample = statuses?.[0] || null;

  const createPayload = buildStatusPayloadFromInput(
    { sts_name: payload?.sts_name, sts_desc: payload?.sts_desc, is_active: hasOwn(payload || {}, "is_active") ? payload?.is_active : true },
    sample,
  );
  if (!hasOwn(createPayload, "is_active")) createPayload.is_active = true;
  assertValidPayload(createPayload, "No valid status payload supplied.");

  const { data, error } = await supabase.from("psb_s_status").insert(createPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create status");
  return data;
}

export async function updateStatusAction(statusId, updates) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: fetchErr } = await supabase.from("psb_s_status").select("*").eq("status_id", statusId).single();
  if (fetchErr) throw new Error(fetchErr.message || "Failed to fetch status");

  const payload = buildStatusPayloadFromInput(updates, existing);
  assertValidPayload(payload, "No valid status updates supplied.");

  const { data, error } = await supabase.from("psb_s_status").update(payload).eq("status_id", statusId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update status");
  return data;
}

export async function deactivateStatusAction(statusId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("psb_s_status").update({ is_active: false }).eq("status_id", statusId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate status");
  return { statusId, deactivated: true };
}

export async function hardDeleteStatusAction(statusId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("psb_s_status").delete().eq("status_id", statusId);
  if (error) throw new Error(error.message || "Failed to permanently delete status");
  return { statusId, permanentlyDeleted: true };
}
