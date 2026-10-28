"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

// ─── Private helpers ───────────────────────────────────────

function normalizeText(value, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source || {}, key);
}

// ─── Load data ─────────────────────────────────────────────

export async function loadCompanyDepartmentSetupData() {
  const supabase = getSupabaseAdmin();

  const [{ data: companies, error: cErr }, { data: departments, error: dErr }] =
    await Promise.all([
      supabase.from("psb_s_company").select("*").order("comp_name", { ascending: true }),
      supabase.from("psb_s_department").select("*").order("dept_name", { ascending: true }),
    ]);

  if (cErr) throw new Error(cErr.message || "Failed to fetch companies");
  if (dErr) throw new Error(dErr.message || "Failed to fetch departments");

  return {
    companies: Array.isArray(companies) ? companies : [],
    departments: Array.isArray(departments) ? departments : [],
  };
}

// ─── Company Actions ───────────────────────────────────────

export async function createCompanyAction(payload) {
  const supabase = getSupabaseAdmin();
  const compName = normalizeText(payload?.comp_name);
  if (!compName) throw new Error("Company name is required.");

  const insertPayload = {
    comp_name: compName,
    // The column is short_name; the screen calls the field comp_short_name.
    short_name: normalizeText(payload?.comp_short_name) || null,
    comp_email: normalizeText(payload?.comp_email) || null,
    comp_phone: normalizeText(payload?.comp_phone) || null,
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  const { data, error } = await supabase.from("psb_s_company").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create company");
  return data;
}

export async function updateCompanyAction(companyId, updates) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "comp_name")) {
    const name = normalizeText(updates.comp_name);
    if (!name) throw new Error("Company name cannot be empty.");
    patch.comp_name = name;
  }
  if (hasOwn(updates, "comp_short_name")) patch.short_name = normalizeText(updates.comp_short_name) || null;
  if (hasOwn(updates, "comp_email")) patch.comp_email = normalizeText(updates.comp_email) || null;
  if (hasOwn(updates, "comp_phone")) patch.comp_phone = normalizeText(updates.comp_phone) || null;
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("psb_s_company").update(patch).eq("comp_id", companyId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update company");
  return data;
}

export async function deactivateCompanyAction(companyId) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade deactivate linked departments (all in one query)
  await supabase.from("psb_s_department").update({ is_active: false }).eq("comp_id", companyId);

  const { data, error } = await supabase.from("psb_s_company").update({ is_active: false }).eq("comp_id", companyId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate company");
  return data;
}

export async function hardDeleteCompanyAction(companyId) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade delete linked departments (counted first for the reply, then deleted in one query)
  const { data: linkedDepts } = await supabase.from("psb_s_department").select("dept_id").eq("comp_id", companyId);
  if ((linkedDepts || []).length > 0) {
    await supabase.from("psb_s_department").delete().eq("comp_id", companyId);
  }

  const { error } = await supabase.from("psb_s_company").delete().eq("comp_id", companyId);
  if (error) throw new Error(error.message || "Failed to permanently delete company");
  return { companyId, deletedDepartmentCount: (linkedDepts || []).length, permanentlyDeleted: true };
}

// ─── Department Actions ────────────────────────────────────

export async function createDepartmentAction(payload) {
  const supabase = getSupabaseAdmin();
  const deptName = normalizeText(payload?.dept_name);
  if (!deptName) throw new Error("Department name is required.");
  const compId = payload?.comp_id;
  if (compId == null || compId === "") throw new Error("Company ID is required.");

  const insertPayload = {
    comp_id: compId,
    dept_name: deptName,
    // The column is short_name; the screen calls the field dept_short_name.
    short_name: normalizeText(payload?.dept_short_name) || null,
    is_active: payload?.is_active !== undefined ? payload.is_active : true,
  };

  const { data, error } = await supabase.from("psb_s_department").insert(insertPayload).select("*").single();
  if (error) throw new Error(error.message || "Failed to create department");
  return data;
}

export async function updateDepartmentAction(departmentId, updates) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();
  const patch = {};

  if (hasOwn(updates, "dept_name")) {
    const name = normalizeText(updates.dept_name);
    if (!name) throw new Error("Department name cannot be empty.");
    patch.dept_name = name;
  }
  if (hasOwn(updates, "dept_short_name")) patch.short_name = normalizeText(updates.dept_short_name) || null;
  if (hasOwn(updates, "is_active")) patch.is_active = updates.is_active;
  if (Object.keys(patch).length === 0) throw new Error("No valid fields to update.");

  const { data, error } = await supabase.from("psb_s_department").update(patch).eq("dept_id", departmentId).select("*").single();
  if (error) throw new Error(error.message || "Failed to update department");
  return data;
}

export async function deactivateDepartmentAction(departmentId) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.from("psb_s_department").update({ is_active: false }).eq("dept_id", departmentId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate department");
  return data;
}

export async function hardDeleteDepartmentAction(departmentId) {
  if (departmentId == null || departmentId === "") throw new Error("Department ID is required.");
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("psb_s_department").delete().eq("dept_id", departmentId);
  if (error) throw new Error(error.message || "Failed to permanently delete department");
  return { departmentId, permanentlyDeleted: true };
}

// ─── Batch save ────────────────────────────────────────────

// Same prefixes as TEMP_COMPANY_PREFIX / TEMP_DEPARTMENT_PREFIX in companyDepartmentSetup.data.js.
const TEMP_COMPANY_ID_PREFIX = "tmp-company-";
const TEMP_DEPARTMENT_ID_PREFIX = "tmp-department-";

/**
 * Saves a whole staged batch in ONE call from the browser (it used to be one
 * call per change). Same step order as before: company creates → company
 * edits → company deactivations → department creates → department edits →
 * department deactivations → department deletes → company deletes. The items
 * of each step run together. Returns { companyIdMap: { tempId: newId } }.
 */
export async function saveCompanyDepartmentBatch(companyChanges, departmentChanges) {
  const companies = companyChanges || {};
  const departments = departmentChanges || {};
  const companyIdMap = {};
  const isTempCompany = (id) => String(id ?? "").startsWith(TEMP_COMPANY_ID_PREFIX);
  const isTempDepartment = (id) => String(id ?? "").startsWith(TEMP_DEPARTMENT_ID_PREFIX);
  const resolveCompanyId = (id) => companyIdMap[String(id ?? "")] ?? id;
  const deactivatedCompanySet = new Set(
    [...(companies.deactivations || []), ...(companies.hardDeletes || [])].map((id) => String(id ?? "")),
  );
  const deactivatedDepartmentSet = new Set(
    [...(departments.deactivations || []), ...(departments.hardDeletes || [])].map((id) => String(id ?? "")),
  );

  await Promise.all((companies.creates || []).map(async (entry) => {
    const created = await createCompanyAction(entry.payload);
    const id = created?.comp_id;
    if (id == null || id === "") throw new Error("Created company response is invalid.");
    companyIdMap[String(entry.tempId)] = id;
  }));

  await Promise.all(Object.entries(companies.updates || {}).map(async ([companyId, updates]) => {
    const resolved = resolveCompanyId(companyId);
    if (deactivatedCompanySet.has(String(resolved)) || isTempCompany(resolved)) return;
    if (Object.keys(updates || {}).length === 0) return;
    await updateCompanyAction(resolved, updates);
  }));

  await Promise.all((companies.deactivations || []).map(async (companyId) => {
    const resolved = resolveCompanyId(companyId);
    if (isTempCompany(resolved)) return;
    await deactivateCompanyAction(resolved);
  }));

  await Promise.all((departments.creates || []).map(async (entry) => {
    const resolved = resolveCompanyId(entry?.payload?.comp_id);
    if (!resolved || deactivatedCompanySet.has(String(resolved))) return;
    if (isTempCompany(resolved)) throw new Error("Save company batch first before saving departments for a newly created company.");
    await createDepartmentAction({ ...entry.payload, comp_id: resolved });
  }));

  await Promise.all(Object.entries(departments.updates || {}).map(async ([deptId, updates]) => {
    if (deactivatedDepartmentSet.has(String(deptId)) || isTempDepartment(deptId)) return;
    if (Object.keys(updates || {}).length === 0) return;
    await updateDepartmentAction(deptId, updates);
  }));

  await Promise.all((departments.deactivations || []).filter((id) => !isTempDepartment(id)).map((id) => deactivateDepartmentAction(id)));
  await Promise.all((departments.hardDeletes || []).filter((id) => !isTempDepartment(id)).map((id) => hardDeleteDepartmentAction(id)));

  await Promise.all((companies.hardDeletes || []).map(async (companyId) => {
    const resolved = resolveCompanyId(companyId);
    if (isTempCompany(resolved)) return;
    await hardDeleteCompanyAction(resolved);
  }));

  return { companyIdMap };
}
