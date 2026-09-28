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
    comp_short_name: normalizeText(payload?.comp_short_name) || null,
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
  if (hasOwn(updates, "comp_short_name")) patch.comp_short_name = normalizeText(updates.comp_short_name) || null;
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

  // Cascade deactivate linked departments
  const { data: linkedDepts } = await supabase.from("psb_s_department").select("dept_id").eq("comp_id", companyId);
  for (const dept of linkedDepts || []) {
    await supabase.from("psb_s_department").update({ is_active: false }).eq("dept_id", dept.dept_id);
  }

  const { data, error } = await supabase.from("psb_s_company").update({ is_active: false }).eq("comp_id", companyId).select("*").single();
  if (error) throw new Error(error.message || "Failed to deactivate company");
  return data;
}

export async function hardDeleteCompanyAction(companyId) {
  if (companyId == null || companyId === "") throw new Error("Company ID is required.");
  const supabase = getSupabaseAdmin();

  // Cascade delete linked departments
  const { data: linkedDepts } = await supabase.from("psb_s_department").select("dept_id").eq("comp_id", companyId);
  for (const dept of linkedDepts || []) {
    await supabase.from("psb_s_department").delete().eq("dept_id", dept.dept_id);
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
    dept_short_name: normalizeText(payload?.dept_short_name) || null,
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
  if (hasOwn(updates, "dept_short_name")) patch.dept_short_name = normalizeText(updates.dept_short_name) || null;
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
