"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

function normalizeText(value, fallback = "") {
  return String(value ?? fallback).trim();
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

function getWorkflowDisplayOrder(wf, fallback = 0) {
  const candidates = [wf?.display_order, wf?.wf_order, wf?.sort_order, wf?.order_no];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function getStageDisplayOrder(stage, fallback = 0) {
  const candidates = [stage?.stage_order, stage?.display_order, stage?.sort_order, stage?.order_no];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

// ─── DATA LOADING ──────────────────────────────────────────

export async function loadWorkflowSetupData() {
  const supabase = getSupabaseAdmin();

  const [wfResult, stagesResult, stageTypesResult, orgRolesResult, companiesResult, departmentsResult, appsResult] = await Promise.all([
    supabase.from("wfk_s_workflow").select("*").order("wf_id", { ascending: true }),
    supabase.from("wfk_s_workflowstages").select("*").order("stage_order", { ascending: true }),
    supabase.from("wfk_s_stagetype").select("*").order("stagetype_name", { ascending: true }),
    supabase.from("wfk_s_orgrole").select("*").order("name", { ascending: true }),
    supabase.from("psb_s_company").select("comp_id, comp_name").order("comp_name", { ascending: true }),
    supabase.from("psb_s_department").select("dept_id, dept_name, comp_id").order("dept_name", { ascending: true }),
    supabase.from("psb_s_application").select("app_id, app_name").order("app_name", { ascending: true }),
  ]);

  if (wfResult.error) throw new Error(wfResult.error.message || "Failed to fetch workflows");
  if (stagesResult.error) throw new Error(stagesResult.error.message || "Failed to fetch workflow stages");

  const workflows = (Array.isArray(wfResult.data) ? wfResult.data : [])
    .sort((a, b) => {
      const d = getWorkflowDisplayOrder(a, Number.MAX_SAFE_INTEGER) - getWorkflowDisplayOrder(b, Number.MAX_SAFE_INTEGER);
      if (d !== 0) return d;
      return compareText(a.wf_name, b.wf_name);
    });

  return {
    workflows,
    stages: Array.isArray(stagesResult.data) ? stagesResult.data : [],
    stageTypes: Array.isArray(stageTypesResult.data) ? stageTypesResult.data : [],
    orgRoles: Array.isArray(orgRolesResult.data) ? orgRolesResult.data : [],
    companies: Array.isArray(companiesResult.data) ? companiesResult.data : [],
    departments: Array.isArray(departmentsResult.data) ? departmentsResult.data : [],
    apps: Array.isArray(appsResult.data) ? appsResult.data : [],
  };
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base", numeric: true });
}

export async function loadStageTypesData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("wfk_s_stagetype").select("*").order("stagetype_name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to fetch stage types");
  return { items: data ?? [] };
}

export async function loadApprovalTypesData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("wfk_s_approvaltype").select("*").order("approvaltype_name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to fetch approval types");
  return { items: data ?? [] };
}

export async function loadStatusesData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("wfk_s_status").select("*").order("status_name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to fetch statuses");
  return { items: data ?? [] };
}

export async function loadOrgRolesData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("wfk_s_orgrole").select("*").order("name", { ascending: true });
  if (error) throw new Error(error.message || "Failed to fetch org roles");
  return { items: data ?? [] };
}

export async function loadStageParticipantsData() {
  const supabase = getSupabaseAdmin();
  const [participantsResult, stagesResult, orgRolesResult, approvalTypesResult] = await Promise.all([
    supabase.from("wfk_m_stageparticipant").select("*").order("stageparticipant_id", { ascending: true }),
    supabase.from("wfk_s_workflowstages").select("wfs_id, stage_name").order("stage_name", { ascending: true }),
    supabase.from("wfk_s_orgrole").select("orgrole_id, name").order("name", { ascending: true }),
    supabase.from("wfk_s_approvaltype").select("approvaltype_id, approvaltype_name").order("approvaltype_name", { ascending: true }),
  ]);
  if (participantsResult.error) throw new Error(participantsResult.error.message || "Failed to fetch stage participants");
  return {
    items: participantsResult.data ?? [],
    stages: stagesResult.data ?? [],
    orgRoles: orgRolesResult.data ?? [],
    approvalTypes: approvalTypesResult.data ?? [],
  };
}

export async function loadUserOrgRolesData() {
  const supabase = getSupabaseAdmin();
  const [mappingsResult, orgRolesResult, usersResult] = await Promise.all([
    supabase.from("wfk_m_userorgrole").select("*").order("user_orgrole_id", { ascending: true }),
    supabase.from("wfk_s_orgrole").select("orgrole_id, name").order("name", { ascending: true }),
    supabase.from("psb_s_user").select("user_id, username, first_name, last_name").order("username", { ascending: true }),
  ]);
  if (mappingsResult.error) throw new Error(mappingsResult.error.message || "Failed to fetch user org roles");
  return {
    items: mappingsResult.data ?? [],
    orgRoles: orgRolesResult.data ?? [],
    users: usersResult.data ?? [],
  };
}

// ─── CONSOLIDATED OVERVIEW LOADER ──────────────────────────

export async function loadWorkflowOverviewData() {
  const supabase = getSupabaseAdmin();

  const [
    wfResult, stagesResult, stageTypesResult, approvalTypesResult, orgRolesResult,
    participantsResult, usersResult, userOrgRolesResult, companiesResult, departmentsResult, appsResult, statusesResult,
  ] = await Promise.all([
    supabase.from("wfk_s_workflow").select("*"),
    supabase.from("wfk_s_workflowstages").select("*"),
    supabase.from("wfk_s_stagetype").select("*"),
    supabase.from("wfk_s_approvaltype").select("*"),
    supabase.from("wfk_s_orgrole").select("*"),
    supabase.from("wfk_m_stageparticipant").select("*"),
    supabase.from("psb_s_user").select("user_id, username, first_name, last_name"),
    supabase.from("wfk_m_userorgrole").select("*"),
    supabase.from("psb_s_company").select("comp_id, comp_name"),
    supabase.from("psb_s_department").select("dept_id, dept_name, comp_id"),
    supabase.from("psb_s_application").select("app_id, app_name"),
    supabase.from("wfk_s_status").select("*"),
  ]);

  if (wfResult.error) throw new Error(wfResult.error.message || "Failed to fetch workflows");
  if (stagesResult.error) throw new Error(stagesResult.error.message || "Failed to fetch workflow stages");
  if (participantsResult.error) throw new Error(participantsResult.error.message || "Failed to fetch stage participants");
  if (userOrgRolesResult.error) throw new Error(userOrgRolesResult.error.message || "Failed to fetch user org roles");

  const workflows = (Array.isArray(wfResult.data) ? wfResult.data : [])
    .sort((a, b) => {
      const d = getWorkflowDisplayOrder(a, Number.MAX_SAFE_INTEGER) - getWorkflowDisplayOrder(b, Number.MAX_SAFE_INTEGER);
      if (d !== 0) return d;
      return compareText(a.wf_name, b.wf_name);
    });

  return {
    workflows,
    stages: Array.isArray(stagesResult.data) ? stagesResult.data : [],
    stageTypes: Array.isArray(stageTypesResult.data) ? stageTypesResult.data : [],
    approvalTypes: Array.isArray(approvalTypesResult.data) ? approvalTypesResult.data : [],
    orgRoles: Array.isArray(orgRolesResult.data) ? orgRolesResult.data : [],
    stageParticipants: Array.isArray(participantsResult.data) ? participantsResult.data : [],
    users: Array.isArray(usersResult.data) ? usersResult.data : [],
    userOrgRoles: Array.isArray(userOrgRolesResult.data) ? userOrgRolesResult.data : [],
    companies: Array.isArray(companiesResult.data) ? companiesResult.data : [],
    departments: Array.isArray(departmentsResult.data) ? departmentsResult.data : [],
    apps: Array.isArray(appsResult.data) ? appsResult.data : [],
    statuses: Array.isArray(statusesResult.data) ? statusesResult.data : [],
  };
}

// ─── WORKFLOW ACTIONS ──────────────────────────────────────

export async function createWorkflowAction(payload) {
  const supabase = getSupabaseAdmin();
  const wfName = normalizeText(payload?.wf_name);
  const wfDesc = sanitizeOptionalText(payload?.wf_description);
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;
  const compId = payload?.comp_id ?? null;
  const deptId = payload?.dept_id ?? null;
  const appId = payload?.app_id ?? null;

  if (!wfName) throw new Error("Workflow name is required.");

  const { data: existing } = await supabase.from("wfk_s_workflow").select("wf_id").ilike("wf_name", wfName).maybeSingle();
  if (existing) throw new Error(`Workflow name "${wfName}" already exists.`);

  const { data: wfs } = await supabase.from("wfk_s_workflow").select("*").order("wf_id", { ascending: true });
  const nextOrder = (Array.isArray(wfs) ? wfs : []).reduce(
    (max, wf) => Math.max(max, getWorkflowDisplayOrder(wf, 0)), 0,
  ) + 1;

  const { data, error } = await supabase.from("wfk_s_workflow")
    .insert({ wf_name: wfName, wf_description: wfDesc, is_active: isActive, display_order: nextOrder, comp_id: compId, dept_id: deptId, app_id: appId })
    .select("*").single();
  if (error) throw new Error(error.message || "Failed to create workflow");
  return data;
}

export async function updateWorkflowAction(wfId, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "wf_name")) {
    const name = normalizeText(updates.wf_name);
    if (!name) throw new Error("Workflow name is required.");
    payload.wf_name = name;
  }
  if (hasOwn(updates, "wf_description")) payload.wf_description = sanitizeOptionalText(updates.wf_description);
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (hasOwn(updates, "comp_id")) payload.comp_id = updates.comp_id ?? null;
  if (hasOwn(updates, "dept_id")) payload.dept_id = updates.dept_id ?? null;
  if (hasOwn(updates, "app_id")) payload.app_id = updates.app_id ?? null;
  if (Object.keys(payload).length === 0) throw new Error("No valid workflow updates supplied.");

  const { data, error } = await supabase.from("wfk_s_workflow")
    .update(payload).eq("wf_id", wfId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update workflow");
  return data;
}

export async function deactivateWorkflowAction(wfId) {
  const supabase = getSupabaseAdmin();
  // Cascade deactivate stages
  const { data: stages } = await supabase.from("wfk_s_workflowstages").select("wfs_id").eq("wf_id", wfId);
  for (const stage of stages || []) {
    await supabase.from("wfk_s_workflowstages").update({ is_active: false }).eq("wfs_id", stage.wfs_id);
  }
  const { error } = await supabase.from("wfk_s_workflow").update({ is_active: false }).eq("wf_id", wfId);
  if (error) throw new Error(error.message || "Failed to deactivate workflow");
  return { wfId, deactivated: true };
}

export async function hardDeleteWorkflowAction(wfId) {
  const supabase = getSupabaseAdmin();
  // Cascade delete stages
  const { data: stages } = await supabase.from("wfk_s_workflowstages").select("wfs_id").eq("wf_id", wfId);
  for (const stage of stages || []) {
    await supabase.from("wfk_m_stageparticipant").delete().eq("wfs_id", stage.wfs_id);
    await supabase.from("wfk_s_workflowstages").delete().eq("wfs_id", stage.wfs_id);
  }
  const { error } = await supabase.from("wfk_s_workflow").delete().eq("wf_id", wfId);
  if (error) throw new Error(error.message || "Failed to permanently delete workflow");
  return { wfId, permanentlyDeleted: true };
}

// ─── WORKFLOW STAGE ACTIONS ────────────────────────────────

export async function createWorkflowStageAction(payload) {
  const supabase = getSupabaseAdmin();
  const wfId = payload?.wf_id;
  const stageName = normalizeText(payload?.stage_name);
  const stageDesc = sanitizeOptionalText(payload?.stage_description);
  const stagetypeId = payload?.stagetype_id ?? null;
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;

  if (wfId == null || wfId === "") throw new Error("Workflow id is required.");
  if (!stageName) throw new Error("Stage name is required.");

  const { error: wfErr } = await supabase.from("wfk_s_workflow").select("wf_id").eq("wf_id", wfId).single();
  if (wfErr) throw new Error(wfErr.message || "Workflow not found.");

  const { data: siblings } = await supabase.from("wfk_s_workflowstages").select("*").eq("wf_id", wfId);
  const nextOrder = (Array.isArray(siblings) ? siblings : []).reduce(
    (max, s) => Math.max(max, getStageDisplayOrder(s, 0)), 0,
  ) + 1;

  const { data, error } = await supabase.from("wfk_s_workflowstages")
    .insert({ wf_id: wfId, stage_name: stageName, stage_description: stageDesc, stage_order: nextOrder, stagetype_id: stagetypeId, is_active: isActive })
    .select("*").single();
  if (error) throw new Error(error.message || "Failed to create workflow stage");
  return data;
}

export async function updateWorkflowStageAction(stageId, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "stage_name")) {
    const name = normalizeText(updates.stage_name);
    if (!name) throw new Error("Stage name is required.");
    payload.stage_name = name;
  }
  if (hasOwn(updates, "stage_description")) payload.stage_description = sanitizeOptionalText(updates.stage_description);
  if (hasOwn(updates, "stagetype_id")) payload.stagetype_id = updates.stagetype_id ?? null;
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(payload).length === 0) throw new Error("No valid stage updates supplied.");

  const { data, error } = await supabase.from("wfk_s_workflowstages")
    .update(payload).eq("wfs_id", stageId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update workflow stage");
  return data;
}

export async function deactivateWorkflowStageAction(stageId) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_s_workflowstages").update({ is_active: false }).eq("wfs_id", stageId);
  if (error) throw new Error(error.message || "Failed to deactivate workflow stage");
  return { stageId, deactivated: true };
}

export async function hardDeleteWorkflowStageAction(stageId) {
  const supabase = getSupabaseAdmin();
  await supabase.from("wfk_m_stageparticipant").delete().eq("wfs_id", stageId);
  const { error } = await supabase.from("wfk_s_workflowstages").delete().eq("wfs_id", stageId);
  if (error) throw new Error(error.message || "Failed to permanently delete workflow stage");
  return { stageId, permanentlyDeleted: true };
}

// ─── ORDER ACTION ──────────────────────────────────────────

export async function saveWorkflowOrderAction(wfIds) {
  const supabase = getSupabaseAdmin();
  const requestedIds = (Array.isArray(wfIds) ? wfIds : [])
    .map((id) => (typeof id === "string" && id.trim() !== "" && Number.isFinite(Number(id)) ? Number(id) : id))
    .filter((id) => id != null && id !== "");

  if (requestedIds.length === 0) throw new Error("No workflows supplied for ordering.");

  const { data: wfs } = await supabase.from("wfk_s_workflow").select("*").order("wf_id", { ascending: true });
  const validIds = new Set((wfs || []).map((w) => String(w?.wf_id ?? "")));
  const invalidIds = requestedIds.filter((id) => !validIds.has(String(id)));
  if (invalidIds.length > 0) throw new Error("One or more workflows are invalid for order updates.");

  const offset = 100000;
  for (let i = 0; i < requestedIds.length; i++) {
    const { error } = await supabase.from("wfk_s_workflow")
      .update({ display_order: offset + i + 1 }).eq("wf_id", requestedIds[i]);
    if (error) throw new Error(error.message || "Failed to update workflow order");
  }
  for (let i = 0; i < requestedIds.length; i++) {
    const { error } = await supabase.from("wfk_s_workflow")
      .update({ display_order: i + 1 }).eq("wf_id", requestedIds[i]);
    if (error) throw new Error(error.message || "Failed to update workflow order");
  }

  return { updatedCount: requestedIds.length };
}

// ─── STAGE TYPE ACTIONS ────────────────────────────────────

export async function createStageTypeAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.stagetype_name);
  const desc = sanitizeOptionalText(payload?.stagetype_description);
  if (!name) throw new Error("Stage type name is required.");
  const { data, error } = await supabase.from("wfk_s_stagetype")
    .insert({ stagetype_name: name, stagetype_description: desc }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create stage type");
  return data;
}

export async function updateStageTypeAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "stagetype_name")) {
    const name = normalizeText(updates.stagetype_name);
    if (!name) throw new Error("Stage type name is required.");
    payload.stagetype_name = name;
  }
  if (hasOwn(updates, "stagetype_description")) payload.stagetype_description = sanitizeOptionalText(updates.stagetype_description);
  if (Object.keys(payload).length === 0) throw new Error("No valid stage type updates supplied.");
  const { data, error } = await supabase.from("wfk_s_stagetype")
    .update(payload).eq("stagetype_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update stage type");
  return data;
}

export async function deactivateStageTypeAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_s_stagetype").delete().eq("stagetype_id", id);
  if (error) throw new Error(error.message || "Failed to delete stage type");
  return { id, deactivated: true };
}

export async function hardDeleteStageTypeAction(id) {
  return deactivateStageTypeAction(id);
}

// ─── APPROVAL TYPE ACTIONS ─────────────────────────────────

export async function createApprovalTypeAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.approvaltype_name);
  const desc = sanitizeOptionalText(payload?.approvaltype_description);
  if (!name) throw new Error("Approval type name is required.");
  const { data, error } = await supabase.from("wfk_s_approvaltype")
    .insert({ approvaltype_name: name, approvaltype_description: desc }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create approval type");
  return data;
}

export async function updateApprovalTypeAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "approvaltype_name")) {
    const name = normalizeText(updates.approvaltype_name);
    if (!name) throw new Error("Approval type name is required.");
    payload.approvaltype_name = name;
  }
  if (hasOwn(updates, "approvaltype_description")) payload.approvaltype_description = sanitizeOptionalText(updates.approvaltype_description);
  if (Object.keys(payload).length === 0) throw new Error("No valid approval type updates supplied.");
  const { data, error } = await supabase.from("wfk_s_approvaltype")
    .update(payload).eq("approvaltype_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update approval type");
  return data;
}

export async function deactivateApprovalTypeAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_s_approvaltype").delete().eq("approvaltype_id", id);
  if (error) throw new Error(error.message || "Failed to delete approval type");
  return { id, deactivated: true };
}

export async function hardDeleteApprovalTypeAction(id) {
  return deactivateApprovalTypeAction(id);
}

// ─── STATUS ACTIONS ────────────────────────────────────────

export async function createStatusAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.status_name);
  const desc = sanitizeOptionalText(payload?.status_description);
  if (!name) throw new Error("Status name is required.");
  const { data, error } = await supabase.from("wfk_s_status")
    .insert({ status_name: name, status_description: desc }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create status");
  return data;
}

export async function updateStatusAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "status_name")) {
    const name = normalizeText(updates.status_name);
    if (!name) throw new Error("Status name is required.");
    payload.status_name = name;
  }
  if (hasOwn(updates, "status_description")) payload.status_description = sanitizeOptionalText(updates.status_description);
  if (Object.keys(payload).length === 0) throw new Error("No valid status updates supplied.");
  const { data, error } = await supabase.from("wfk_s_status")
    .update(payload).eq("status_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update status");
  return data;
}

export async function deactivateStatusAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_s_status").delete().eq("status_id", id);
  if (error) throw new Error(error.message || "Failed to delete status");
  return { id, deactivated: true };
}

export async function hardDeleteStatusAction(id) {
  return deactivateStatusAction(id);
}

// ─── ORG ROLE ACTIONS ──────────────────────────────────────

export async function createOrgRoleAction(payload) {
  const supabase = getSupabaseAdmin();
  const name = normalizeText(payload?.name);
  const desc = sanitizeOptionalText(payload?.description);
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;
  if (!name) throw new Error("Org role name is required.");
  const { data, error } = await supabase.from("wfk_s_orgrole")
    .insert({ name, description: desc, is_active: isActive }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create org role");
  return data;
}

export async function updateOrgRoleAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "name")) {
    const name = normalizeText(updates.name);
    if (!name) throw new Error("Org role name is required.");
    payload.name = name;
  }
  if (hasOwn(updates, "description")) payload.description = sanitizeOptionalText(updates.description);
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(payload).length === 0) throw new Error("No valid org role updates supplied.");
  const { data, error } = await supabase.from("wfk_s_orgrole")
    .update(payload).eq("orgrole_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update org role");
  return data;
}

export async function deactivateOrgRoleAction(id) {
  const supabase = getSupabaseAdmin();
  // Cascade deactivate users in charge for this role
  const { data: userRoles } = await supabase.from("wfk_m_userorgrole").select("user_orgrole_id").eq("role_id", id);
  for (const ur of userRoles || []) {
    await supabase.from("wfk_m_userorgrole").update({ is_active: false }).eq("user_orgrole_id", ur.user_orgrole_id);
  }
  const { error } = await supabase.from("wfk_s_orgrole").update({ is_active: false }).eq("orgrole_id", id);
  if (error) throw new Error(error.message || "Failed to deactivate org role");
  return { id, deactivated: true };
}

export async function hardDeleteOrgRoleAction(id) {
  const supabase = getSupabaseAdmin();
  // Cascade delete users in charge for this role
  await supabase.from("wfk_m_userorgrole").delete().eq("role_id", id);
  const { error } = await supabase.from("wfk_s_orgrole").delete().eq("orgrole_id", id);
  if (error) throw new Error(error.message || "Failed to permanently delete org role");
  return { id, permanentlyDeleted: true };
}

// ─── STAGE PARTICIPANT ACTIONS ─────────────────────────────

export async function createStageParticipantAction(payload) {
  const supabase = getSupabaseAdmin();
  const wfsId = payload?.wfs_id;
  const orgroleId = payload?.orgrole_id ?? null;
  const approvaltypeId = payload?.approvaltype_id ?? null;
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;
  if (wfsId == null || wfsId === "") throw new Error("Stage is required.");
  const { data, error } = await supabase.from("wfk_m_stageparticipant")
    .insert({ wfs_id: wfsId, orgrole_id: orgroleId, approvaltype_id: approvaltypeId, is_active: isActive }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create stage participant");
  return data;
}

export async function updateStageParticipantAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "wfs_id")) payload.wfs_id = updates.wfs_id ?? null;
  if (hasOwn(updates, "orgrole_id")) payload.orgrole_id = updates.orgrole_id ?? null;
  if (hasOwn(updates, "approvaltype_id")) payload.approvaltype_id = updates.approvaltype_id ?? null;
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (Object.keys(payload).length === 0) throw new Error("No valid stage participant updates supplied.");
  const { data, error } = await supabase.from("wfk_m_stageparticipant")
    .update(payload).eq("stageparticipant_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update stage participant");
  return data;
}

export async function deactivateStageParticipantAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_m_stageparticipant").update({ is_active: false }).eq("stageparticipant_id", id);
  if (error) throw new Error(error.message || "Failed to deactivate stage participant");
  return { id, deactivated: true };
}

export async function hardDeleteStageParticipantAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_m_stageparticipant").delete().eq("stageparticipant_id", id);
  if (error) throw new Error(error.message || "Failed to permanently delete stage participant");
  return { id, permanentlyDeleted: true };
}

// ─── USER ORG ROLE ACTIONS ─────────────────────────────────

export async function createUserOrgRoleAction(payload) {
  const supabase = getSupabaseAdmin();
  const userId = payload?.user_id;
  const roleId = payload?.role_id;
  const isActive = hasOwn(payload || {}, "is_active") ? normalizeBoolean(payload?.is_active) : true;
  const isPrimary = hasOwn(payload || {}, "is_primary") ? normalizeBoolean(payload?.is_primary) : false;
  if (userId == null || userId === "") throw new Error("User is required.");
  if (roleId == null || roleId === "") throw new Error("Org role is required.");
  const { data, error } = await supabase.from("wfk_m_userorgrole")
    .insert({ user_id: userId, role_id: roleId, is_active: isActive, is_primary: isPrimary }).select("*").single();
  if (error) throw new Error(error.message || "Failed to create user org role");
  return data;
}

export async function updateUserOrgRoleAction(id, updates) {
  const supabase = getSupabaseAdmin();
  const payload = {};
  if (hasOwn(updates, "user_id")) payload.user_id = updates.user_id ?? null;
  if (hasOwn(updates, "role_id")) payload.role_id = updates.role_id ?? null;
  if (hasOwn(updates, "is_active")) payload.is_active = normalizeBoolean(updates.is_active);
  if (hasOwn(updates, "is_primary")) payload.is_primary = normalizeBoolean(updates.is_primary);
  if (Object.keys(payload).length === 0) throw new Error("No valid user org role updates supplied.");
  const { data, error } = await supabase.from("wfk_m_userorgrole")
    .update(payload).eq("user_orgrole_id", id).select("*").single();
  if (error) throw new Error(error.message || "Failed to update user org role");
  return data;
}

export async function deactivateUserOrgRoleAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_m_userorgrole").update({ is_active: false }).eq("user_orgrole_id", id);
  if (error) throw new Error(error.message || "Failed to deactivate user org role");
  return { id, deactivated: true };
}

export async function hardDeleteUserOrgRoleAction(id) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("wfk_m_userorgrole").delete().eq("user_orgrole_id", id);
  if (error) throw new Error(error.message || "Failed to permanently delete user org role");
  return { id, permanentlyDeleted: true };
}
