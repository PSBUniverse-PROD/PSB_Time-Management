"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  parseCompanyId, isSameId, compareText, normalizeText, mapCompanyRow, mapDepartmentRow,
  removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_COMPANY_PREFIX, TEMP_DEPARTMENT_PREFIX,
  createTempId, isTempCompanyId, isTempDepartmentId,
  createEmptyCompanyChanges, createEmptyDepartmentChanges,
  executeBatchSave, remapDepartmentsByCompanyId,
} from "../data/companyDepartmentSetup.data.js";

// ═══════════════════════════════════════════════════════════
//  HOOKS
// ═══════════════════════════════════════════════════════════

function useCompanyActions({
  isSaving, isMutatingAction, selectedCompany, allDepartments, orderedCompanies,
  dialog, companyDraft, pendingDeactivatedCompanyIds,
  setOrderedCompanies, setAllDepartments, setCompanyChanges, setDepartmentChanges,
  setDialog, setCompanyDraft, updateSelectedCompanyInQuery,
}) {
  const openAddCompanyDialog = useCallback(() => {
    if (isMutatingAction || isSaving) return;
    setCompanyDraft({ name: "", shortName: "", email: "", phone: "" });
    setDialog({ kind: "add-company", target: null, nextIsActive: true });
  }, [isMutatingAction, isSaving, setCompanyDraft, setDialog]);

  const openEditCompanyDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    setCompanyDraft({
      name: String(row?.comp_name || ""), shortName: String(row?.comp_short_name || ""),
      email: String(row?.comp_email || ""), phone: String(row?.comp_phone || ""),
    });
    setDialog({ kind: "edit-company", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setCompanyDraft, setDialog]);

  const openToggleCompanyDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    const companyId = String(row?.comp_id ?? "");
    if (pendingDeactivatedCompanyIds.has(companyId)) {
      const linkedDeptIds = allDepartments.filter((d) => isSameId(d?.comp_id, companyId)).map((d) => String(d?.dept_id ?? ""));
      setCompanyChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, companyId)),
      }));
      setDepartmentChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
      }));
      toastSuccess("Company deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-company", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [allDepartments, isMutatingAction, isSaving, pendingDeactivatedCompanyIds, setCompanyChanges, setDepartmentChanges, setDialog]);

  const openDeactivateCompanyDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    setDialog({ kind: "deactivate-company", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setDialog]);

  const submitAddCompany = useCallback(() => {
    const companyName = normalizeText(companyDraft.name);
    if (!companyName) { toastError("Company name is required."); return; }
    const shortName = normalizeText(companyDraft.shortName);
    const email = normalizeText(companyDraft.email);
    const phone = normalizeText(companyDraft.phone);
    const tempId = createTempId(TEMP_COMPANY_PREFIX);

    setOrderedCompanies((prev) => [...prev, mapCompanyRow({
      comp_id: tempId, comp_name: companyName, comp_short_name: shortName,
      comp_email: email, comp_phone: phone, is_active: true,
    }, prev.length)]);

    setCompanyChanges((prev) => ({ ...prev, creates: [...prev.creates, {
      tempId, payload: { comp_name: companyName, comp_short_name: shortName, comp_email: email, comp_phone: phone, is_active: true },
    }]}));

    updateSelectedCompanyInQuery(tempId);
    setDialog(EMPTY_DIALOG); setCompanyDraft({ name: "", shortName: "", email: "", phone: "" });
    toastSuccess("Company staged for Save Batch.", "Batching");
  }, [companyDraft, setCompanyChanges, setCompanyDraft, setDialog, setOrderedCompanies, updateSelectedCompanyInQuery]);

  const submitEditCompany = useCallback(() => {
    const row = dialog?.target;
    if (!row?.comp_id) { toastError("Invalid company."); return; }
    const companyName = normalizeText(companyDraft.name);
    if (!companyName) { toastError("Company name is required."); return; }
    const shortName = normalizeText(companyDraft.shortName);
    const email = normalizeText(companyDraft.email);
    const phone = normalizeText(companyDraft.phone);
    const companyId = row.comp_id;

    setOrderedCompanies((prev) => prev.map((c, i) => isSameId(c?.comp_id, companyId)
      ? mapCompanyRow({ ...c, comp_name: companyName, comp_short_name: shortName, comp_email: email, comp_phone: phone }, i) : c));

    setCompanyChanges((prev) => {
      if (isTempCompanyId(companyId)) {
        return { ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, companyId)
            ? { ...e, payload: { ...e.payload, comp_name: companyName, comp_short_name: shortName, comp_email: email, comp_phone: phone } } : e),
          updates: removeObjectKey(prev.updates, companyId),
        };
      }
      return { ...prev, updates: { ...prev.updates,
        [String(companyId)]: mergeUpdatePatch(prev.updates?.[String(companyId)], { comp_name: companyName, comp_short_name: shortName, comp_email: email, comp_phone: phone }),
      }};
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Company update staged for Save Batch.", "Batching");
  }, [companyDraft, dialog, setCompanyChanges, setDialog, setOrderedCompanies]);

  const submitToggleCompany = useCallback(() => {
    const row = dialog?.target; const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.comp_id) { toastError("Invalid company."); return; }
    const companyId = row.comp_id;

    setOrderedCompanies((prev) => prev.map((c, i) => isSameId(c?.comp_id, companyId)
      ? mapCompanyRow({ ...c, is_active: nextIsActive }, i) : c));

    setCompanyChanges((prev) => {
      if (isTempCompanyId(companyId)) {
        return { ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, companyId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e),
          updates: removeObjectKey(prev.updates, companyId),
        };
      }
      return { ...prev, updates: { ...prev.updates,
        [String(companyId)]: mergeUpdatePatch(prev.updates?.[String(companyId)], { is_active: nextIsActive }),
      }};
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`Company ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog, setCompanyChanges, setDialog, setOrderedCompanies]);

  const submitDeactivateCompany = useCallback(() => {
    const row = dialog?.target;
    if (!row?.comp_id) { toastError("Invalid company."); return; }
    const companyId = row.comp_id;
    const linkedDeptIds = allDepartments.filter((d) => isSameId(d?.comp_id, companyId)).map((d) => String(d?.dept_id ?? ""));

    if (isTempCompanyId(companyId)) {
      const nextCompanies = orderedCompanies.filter((c) => !isSameId(c?.comp_id, companyId));
      setOrderedCompanies(nextCompanies);
      setAllDepartments((prev) => prev.filter((d) => !isSameId(d?.comp_id, companyId)));
      setCompanyChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, companyId)),
        updates: removeObjectKey(prev.updates, companyId),
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, companyId)),
      }));
      setDepartmentChanges((prev) => ({
        creates: prev.creates.filter((e) => !isSameId(e?.payload?.comp_id, companyId)),
        updates: linkedDeptIds.reduce((m, id) => removeObjectKey(m, id), prev.updates),
        deactivations: (prev.deactivations || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
      }));
      if (isSameId(selectedCompany?.comp_id, companyId)) updateSelectedCompanyInQuery(nextCompanies[0]?.comp_id ?? null);
      setDialog(EMPTY_DIALOG); toastSuccess("Company deactivation staged for Save Batch.", "Batching"); return;
    }

    setCompanyChanges((prev) => ({
      ...prev, updates: removeObjectKey(prev.updates, companyId),
      deactivations: appendUniqueId(prev.deactivations, companyId),
    }));
    setDepartmentChanges((prev) => ({
      creates: prev.creates.filter((e) => !isSameId(e?.payload?.comp_id, companyId)),
      updates: linkedDeptIds.reduce((m, id) => removeObjectKey(m, id), prev.updates),
      deactivations: linkedDeptIds.reduce((ids, id) => appendUniqueId(ids, id), prev.deactivations || []),
    }));
    setDialog(EMPTY_DIALOG); toastSuccess("Company deactivation staged for Save Batch.", "Batching");
  }, [allDepartments, dialog, orderedCompanies, selectedCompany?.comp_id, setAllDepartments, setCompanyChanges, setDepartmentChanges, setDialog, setOrderedCompanies, updateSelectedCompanyInQuery]);

  const stageHardDeleteCompany = useCallback((row) => {
    const companyId = String(row?.comp_id ?? "");
    if (!companyId || isMutatingAction || isSaving) return;
    const linkedDeptIds = allDepartments.filter((d) => isSameId(d?.comp_id, companyId)).map((d) => String(d?.dept_id ?? ""));

    if (isTempCompanyId(companyId)) {
      const nextCompanies = orderedCompanies.filter((c) => !isSameId(c?.comp_id, companyId));
      setOrderedCompanies(nextCompanies);
      setAllDepartments((prev) => prev.filter((d) => !isSameId(d?.comp_id, companyId)));
      setCompanyChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, companyId)),
        updates: removeObjectKey(prev.updates, companyId),
      }));
      setDepartmentChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.payload?.comp_id, companyId)),
        updates: linkedDeptIds.reduce((m, id) => removeObjectKey(m, id), prev.updates),
        deactivations: (prev.deactivations || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
        hardDeletes: (prev.hardDeletes || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
      }));
      if (isSameId(selectedCompany?.comp_id, companyId)) updateSelectedCompanyInQuery(nextCompanies[0]?.comp_id ?? null);
      toastSuccess("Staged company removed.", "Batching");
      return;
    }

    setCompanyChanges((prev) => ({
      ...prev,
      updates: removeObjectKey(prev.updates, companyId),
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, companyId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], companyId),
    }));
    setDepartmentChanges((prev) => ({
      ...prev,
      creates: prev.creates.filter((e) => !isSameId(e?.payload?.comp_id, companyId)),
      updates: linkedDeptIds.reduce((m, id) => removeObjectKey(m, id), prev.updates),
      deactivations: (prev.deactivations || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
      hardDeletes: linkedDeptIds.reduce(
        (ids, id) => isTempDepartmentId(id) ? ids : appendUniqueId(ids, id),
        (prev.hardDeletes || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
      ),
    }));
    toastSuccess("Company deletion staged for Save Batch.", "Batching");
  }, [allDepartments, isMutatingAction, isSaving, orderedCompanies, selectedCompany?.comp_id, setAllDepartments, setCompanyChanges, setDepartmentChanges, setOrderedCompanies, updateSelectedCompanyInQuery]);

  const unstageHardDeleteCompany = useCallback((row) => {
    const companyId = String(row?.comp_id ?? "");
    if (!companyId || isMutatingAction || isSaving) return;
    const linkedDeptIds = allDepartments.filter((d) => isSameId(d?.comp_id, companyId)).map((d) => String(d?.dept_id ?? ""));
    setCompanyChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, companyId)),
    }));
    setDepartmentChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !linkedDeptIds.some((lr) => isSameId(lr, id))),
    }));
    toastSuccess("Company deletion un-staged.", "Batching");
  }, [allDepartments, isMutatingAction, isSaving, setCompanyChanges, setDepartmentChanges]);

  return {
    openAddCompanyDialog, openEditCompanyDialog, openToggleCompanyDialog, openDeactivateCompanyDialog,
    submitAddCompany, submitEditCompany, submitToggleCompany, submitDeactivateCompany, stageHardDeleteCompany, unstageHardDeleteCompany,
  };
}

function useDepartmentActions({
  isSaving, isMutatingAction, isSelectedCompanyPendingDeactivation,
  selectedCompany, dialog, departmentDraft, pendingDeactivatedDepartmentIds,
  setAllDepartments, setDepartmentChanges, setDialog, setDepartmentDraft,
}) {
  const openAddDepartmentDialog = useCallback(() => {
    if (isMutatingAction || isSaving) return;
    if (!selectedCompany?.comp_id) { toastError("Select a company before adding a department."); return; }
    if (isSelectedCompanyPendingDeactivation) { toastError("Selected company is staged for deactivation. Save or cancel company batch first."); return; }
    setDepartmentDraft({ name: "", shortName: "" });
    setDialog({ kind: "add-department", target: { comp_id: selectedCompany.comp_id, comp_name: selectedCompany.comp_name }, nextIsActive: true });
  }, [isMutatingAction, isSaving, isSelectedCompanyPendingDeactivation, selectedCompany, setDepartmentDraft, setDialog]);

  const openEditDepartmentDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    setDepartmentDraft({ name: String(row?.dept_name || ""), shortName: String(row?.dept_short_name || "") });
    setDialog({ kind: "edit-department", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setDepartmentDraft, setDialog]);

  const openToggleDepartmentDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    const deptId = String(row?.dept_id ?? "");
    if (pendingDeactivatedDepartmentIds.has(deptId)) {
      setDepartmentChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, deptId)),
      }));
      toastSuccess("Department deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-department", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSaving, pendingDeactivatedDepartmentIds, setDepartmentChanges, setDialog]);

  const openDeactivateDepartmentDialog = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    setDialog({ kind: "deactivate-department", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setDialog]);

  const submitAddDepartment = useCallback(() => {
    const target = dialog?.target;
    if (!target?.comp_id) { toastError("Select a company before adding a department."); return; }
    const deptName = normalizeText(departmentDraft.name);
    if (!deptName) { toastError("Department name is required."); return; }
    const shortName = normalizeText(departmentDraft.shortName);
    const tempId = createTempId(TEMP_DEPARTMENT_PREFIX);

    setAllDepartments((prev) => [...prev, mapDepartmentRow({
      dept_id: tempId, comp_id: target.comp_id, dept_name: deptName, dept_short_name: shortName, is_active: true,
    }, prev.length)]);

    setDepartmentChanges((prev) => ({ ...prev, creates: [...prev.creates, {
      tempId, payload: { comp_id: target.comp_id, dept_name: deptName, dept_short_name: shortName, is_active: true },
    }]}));
    setDialog(EMPTY_DIALOG); setDepartmentDraft({ name: "", shortName: "" });
    toastSuccess("Department staged for Save Batch.", "Batching");
  }, [departmentDraft, dialog, setAllDepartments, setDepartmentChanges, setDepartmentDraft, setDialog]);

  const submitEditDepartment = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dept_id) { toastError("Invalid department."); return; }
    const deptName = normalizeText(departmentDraft.name);
    if (!deptName) { toastError("Department name is required."); return; }
    const shortName = normalizeText(departmentDraft.shortName);
    const deptId = row.dept_id;

    setAllDepartments((prev) => prev.map((d, i) => isSameId(d?.dept_id, deptId)
      ? mapDepartmentRow({ ...d, dept_name: deptName, dept_short_name: shortName }, i) : d));

    setDepartmentChanges((prev) => {
      if (isTempDepartmentId(deptId)) {
        return { ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, deptId)
            ? { ...e, payload: { ...e.payload, dept_name: deptName, dept_short_name: shortName } } : e),
          updates: removeObjectKey(prev.updates, deptId),
        };
      }
      return { ...prev, updates: { ...prev.updates,
        [String(deptId)]: mergeUpdatePatch(prev.updates?.[String(deptId)], { dept_name: deptName, dept_short_name: shortName }),
      }};
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Department update staged for Save Batch.", "Batching");
  }, [departmentDraft, dialog, setAllDepartments, setDepartmentChanges, setDialog]);

  const submitToggleDepartment = useCallback(() => {
    const row = dialog?.target; const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.dept_id) { toastError("Invalid department."); return; }
    const deptId = row.dept_id;

    setAllDepartments((prev) => prev.map((d, i) => isSameId(d?.dept_id, deptId)
      ? mapDepartmentRow({ ...d, is_active: nextIsActive }, i) : d));

    setDepartmentChanges((prev) => {
      if (isTempDepartmentId(deptId)) {
        return { ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, deptId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e),
          updates: removeObjectKey(prev.updates, deptId),
        };
      }
      return { ...prev, updates: { ...prev.updates,
        [String(deptId)]: mergeUpdatePatch(prev.updates?.[String(deptId)], { is_active: nextIsActive }),
      }};
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`Department ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog, setAllDepartments, setDepartmentChanges, setDialog]);

  const submitDeactivateDepartment = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dept_id) { toastError("Invalid department."); return; }
    const deptId = row.dept_id;

    if (isTempDepartmentId(deptId)) {
      setAllDepartments((prev) => prev.filter((d) => !isSameId(d?.dept_id, deptId)));
    }

    setDepartmentChanges((prev) => {
      if (isTempDepartmentId(deptId)) {
        return { ...prev,
          creates: prev.creates.filter((e) => !isSameId(e?.tempId, deptId)),
          updates: removeObjectKey(prev.updates, deptId),
          deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, deptId)),
        };
      }
      return { ...prev, updates: removeObjectKey(prev.updates, deptId), deactivations: appendUniqueId(prev.deactivations, deptId) };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Department deactivation staged for Save Batch.", "Batching");
  }, [dialog, setAllDepartments, setDepartmentChanges, setDialog]);

  const stageHardDeleteDepartment = useCallback((row) => {
    const deptId = String(row?.dept_id ?? "");
    if (!deptId || isMutatingAction || isSaving) return;

    if (isTempDepartmentId(deptId)) {
      setAllDepartments((prev) => prev.filter((d) => !isSameId(d?.dept_id, deptId)));
      setDepartmentChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, deptId)),
        updates: removeObjectKey(prev.updates, deptId),
      }));
      toastSuccess("Staged department removed.", "Batching");
      return;
    }

    setDepartmentChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, deptId)),
      updates: removeObjectKey(prev.updates, deptId),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], deptId),
    }));
    toastSuccess("Department deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSaving, setAllDepartments, setDepartmentChanges]);

  const unstageHardDeleteDepartment = useCallback((row) => {
    const deptId = String(row?.dept_id ?? "");
    if (!deptId || isMutatingAction || isSaving) return;
    setDepartmentChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, deptId)),
    }));
    toastSuccess("Department deletion un-staged.", "Batching");
  }, [isMutatingAction, isSaving, setDepartmentChanges]);

  return {
    openAddDepartmentDialog, openEditDepartmentDialog, openToggleDepartmentDialog, openDeactivateDepartmentDialog,
    submitAddDepartment, submitEditDepartment, submitToggleDepartment, submitDeactivateDepartment, stageHardDeleteDepartment, unstageHardDeleteDepartment,
  };
}

function useCompanyDepartmentSetup({ companies = [], departments = [], initialSelectedCompanyId = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seedCompanies = useMemo(
    () => (Array.isArray(companies) ? companies : []).map((c, i) => mapCompanyRow(c, i)).sort((a, b) => compareText(a.comp_name, b.comp_name)),
    [companies]);

  const seedDepartments = useMemo(
    () => (Array.isArray(departments) ? departments : []).map((d, i) => mapDepartmentRow(d, i)).sort((a, b) => compareText(a.dept_name, b.dept_name)),
    [departments]);

  const [orderedCompanies, setOrderedCompanies] = useState(seedCompanies);
  const [allDepartments, setAllDepartments] = useState(seedDepartments);
  const [companyChanges, setCompanyChanges] = useState(createEmptyCompanyChanges());
  const [departmentChanges, setDepartmentChanges] = useState(createEmptyDepartmentChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [companyDraft, setCompanyDraft] = useState({ name: "", shortName: "", email: "", phone: "" });
  const [departmentDraft, setDepartmentDraft] = useState({ name: "", shortName: "" });
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editingDeptId, setEditingDeptId] = useState(null);
  const [expandedCompanyId, setExpandedCompanyId] = useState(null);
  const batchActiveRef = useRef(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    const fromQ = parseCompanyId(searchParams?.get("company"));
    if (fromQ !== null) return fromQ;
    if (initialSelectedCompanyId != null && initialSelectedCompanyId !== "") return initialSelectedCompanyId;
    return seedCompanies[0]?.comp_id ?? null;
  });

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedCompanies(seedCompanies); setAllDepartments(seedDepartments);
    setCompanyChanges(createEmptyCompanyChanges()); setDepartmentChanges(createEmptyDepartmentChanges());
    setDialog(EMPTY_DIALOG); setCompanyDraft({ name: "", shortName: "", email: "", phone: "" }); setDepartmentDraft({ name: "", shortName: "" });
    setIsMutatingAction(false); setIsSaving(false);
    setEditingCompanyId(null); setEditingDeptId(null);
    const qId = parseCompanyId(searchParams?.get("company"));
    setSelectedCompanyId(qId ?? initialSelectedCompanyId ?? seedCompanies[0]?.comp_id ?? null);
  }, [initialSelectedCompanyId, searchParams, seedCompanies, seedDepartments]);

  const pendingSummary = useMemo(() => {
    const cA = companyChanges.creates.length;
    const cE = Object.entries(companyChanges.updates || {}).filter(([id, patch]) => {
      const seed = seedCompanies.find((c) => isSameId(c?.comp_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const cD = companyChanges.deactivations.length;
    const cH = (companyChanges.hardDeletes || []).length;
    const dA = departmentChanges.creates.length;
    const dE = Object.entries(departmentChanges.updates || {}).filter(([id, patch]) => {
      const seed = seedDepartments.find((d) => isSameId(d?.dept_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const dD = departmentChanges.deactivations.length;
    const dH = (departmentChanges.hardDeletes || []).length;
    return { companyAdded: cA, companyEdited: cE, companyDeactivated: cD, companyHardDeleted: cH, departmentAdded: dA, departmentEdited: dE, departmentDeactivated: dD, departmentHardDeleted: dH, total: cA + cE + cD + cH + dA + dE + dD + dH };
  }, [companyChanges, departmentChanges, seedCompanies, seedDepartments]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedCompanyIds = useMemo(
    () => new Set((companyChanges.deactivations || []).map((id) => String(id ?? ""))), [companyChanges.deactivations]);
  const pendingDeactivatedDepartmentIds = useMemo(
    () => new Set((departmentChanges.deactivations || []).map((id) => String(id ?? ""))), [departmentChanges.deactivations]);
  const pendingHardDeletedCompanyIds = useMemo(
    () => new Set((companyChanges.hardDeletes || []).map((id) => String(id ?? ""))), [companyChanges.hardDeletes]);
  const pendingHardDeletedDepartmentIds = useMemo(
    () => new Set((departmentChanges.hardDeletes || []).map((id) => String(id ?? ""))), [departmentChanges.hardDeletes]);

  const selectedCompany = useMemo(
    () => orderedCompanies.find((c) => isSameId(c?.comp_id, selectedCompanyId)) ?? null, [orderedCompanies, selectedCompanyId]);

  const selectedCompanyDepartments = useMemo(() => {
    if (!selectedCompany?.comp_id) return [];
    return allDepartments.filter((d) => isSameId(d?.comp_id, selectedCompany.comp_id)).sort((a, b) => compareText(a.dept_name, b.dept_name));
  }, [allDepartments, selectedCompany?.comp_id]);

  const isSelectedCompanyPendingDeactivation = useMemo(
    () => pendingDeactivatedCompanyIds.has(String(selectedCompany?.comp_id ?? "")), [pendingDeactivatedCompanyIds, selectedCompany?.comp_id]);

  const decoratedCompanies = useMemo(() => {
    const cIds = new Set((companyChanges.creates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(companyChanges.updates || {}).filter(([id, patch]) => {
      const seed = seedCompanies.find((c) => isSameId(c?.comp_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((companyChanges.deactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((companyChanges.hardDeletes || []).map((e) => String(e ?? "")));
    return orderedCompanies.map((row) => {
      const id = String(row?.comp_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [companyChanges, orderedCompanies, seedCompanies]);

  const decoratedDepartments = useMemo(() => {
    const cIds = new Set((departmentChanges.creates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(departmentChanges.updates || {}).filter(([id, patch]) => {
      const seed = seedDepartments.find((d) => isSameId(d?.dept_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((departmentChanges.deactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((departmentChanges.hardDeletes || []).map((e) => String(e ?? "")));
    return selectedCompanyDepartments.map((row) => {
      const id = String(row?.dept_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [departmentChanges, seedDepartments, selectedCompanyDepartments]);

  const updateSelectedCompanyInQuery = useCallback((companyId) => {
    const p = new URLSearchParams(searchParams?.toString() || "");
    if (companyId == null || companyId === "") p.delete("company"); else p.set("company", String(companyId));
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    setSelectedCompanyId(companyId ?? null);
  }, [pathname, router, searchParams]);

  const closeDialog = useCallback(() => { if (!isMutatingAction && !isSaving) setDialog(EMPTY_DIALOG); }, [isMutatingAction, isSaving]);

  const handleCompanyRowClick = useCallback((row) => {
    if (isMutatingAction || isSaving) return;
    const compId = row?.comp_id;
    setExpandedCompanyId((prev) => isSameId(prev, compId) ? null : compId);
    updateSelectedCompanyInQuery(compId);
  }, [isMutatingAction, isSaving, updateSelectedCompanyInQuery]);

  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSaving || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedCompanies(seedCompanies); setAllDepartments(seedDepartments);
    setCompanyChanges(createEmptyCompanyChanges()); setDepartmentChanges(createEmptyDepartmentChanges());
    setDialog(EMPTY_DIALOG); setCompanyDraft({ name: "", shortName: "", email: "", phone: "" }); setDepartmentDraft({ name: "", shortName: "" });
    setEditingCompanyId(null); setEditingDeptId(null);
    updateSelectedCompanyInQuery(seedCompanies[0]?.comp_id ?? null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSaving, seedCompanies, seedDepartments, updateSelectedCompanyInQuery]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSaving || isMutatingAction) return;
    setIsSaving(true); setIsMutatingAction(true);
    try {
      const { companyIdMap, nextSelectedCompanyId } = await executeBatchSave(
        companyChanges, departmentChanges, orderedCompanies, selectedCompany?.comp_id);
      if (companyIdMap.size > 0) setAllDepartments((prev) => remapDepartmentsByCompanyId(prev, companyIdMap));
      setCompanyChanges(createEmptyCompanyChanges()); setDepartmentChanges(createEmptyDepartmentChanges());
      batchActiveRef.current = false;
      updateSelectedCompanyInQuery(nextSelectedCompanyId);
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally { setIsMutatingAction(false); setIsSaving(false); setEditingCompanyId(null); setEditingDeptId(null); }
  }, [companyChanges, departmentChanges, hasPendingChanges, isMutatingAction, isSaving,
    orderedCompanies, pendingSummary.total, router, selectedCompany?.comp_id, updateSelectedCompanyInQuery]);

  const companyActions = useCompanyActions({
    isSaving, isMutatingAction, selectedCompany, allDepartments, orderedCompanies,
    dialog, companyDraft, pendingDeactivatedCompanyIds,
    setOrderedCompanies, setAllDepartments, setCompanyChanges, setDepartmentChanges,
    setDialog, setCompanyDraft, updateSelectedCompanyInQuery,
  });

  const deptActions = useDepartmentActions({
    isSaving, isMutatingAction, isSelectedCompanyPendingDeactivation,
    selectedCompany, dialog, departmentDraft, pendingDeactivatedDepartmentIds,
    setAllDepartments, setDepartmentChanges, setDialog, setDepartmentDraft,
  });

  const startEditingCompany = useCallback((row) => {
    if (isSaving || isMutatingAction) return;
    const id = String(row?.comp_id ?? "");
    setEditingCompanyId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSaving]);

  const stopEditingCompany = useCallback(() => { setEditingCompanyId(null); }, []);

  const startEditingDept = useCallback((row) => {
    if (isSaving || isMutatingAction) return;
    const id = String(row?.dept_id ?? "");
    setEditingDeptId((prev) => prev === id ? null : id);
  }, [isMutatingAction, isSaving]);

  const stopEditingDept = useCallback(() => { setEditingDeptId(null); }, []);

  const handleInlineEditCompany = useCallback((row, key, value) => {
    const compId = row?.comp_id;
    if (!compId || isSaving || isMutatingAction) return;

    setOrderedCompanies((prev) =>
      prev.map((c, i) => isSameId(c?.comp_id, compId)
        ? mapCompanyRow({ ...c, [key]: value || null }, i) : c),
    );

    setCompanyChanges((prev) => {
      if (isTempCompanyId(compId)) {
        return {
          ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, compId)
            ? { ...e, payload: { ...e.payload, [key]: value || null } } : e),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(compId)]: mergeUpdatePatch(prev.updates?.[String(compId)], { [key]: value || null }),
        },
      };
    });
  }, [isMutatingAction, isSaving]);

  const handleInlineEditDepartment = useCallback((row, key, value) => {
    const deptId = row?.dept_id;
    if (!deptId || isSaving || isMutatingAction) return;

    setAllDepartments((prev) =>
      prev.map((d, i) => isSameId(d?.dept_id, deptId)
        ? mapDepartmentRow({ ...d, [key]: value || null }, i) : d),
    );

    setDepartmentChanges((prev) => {
      if (isTempDepartmentId(deptId)) {
        return {
          ...prev,
          creates: prev.creates.map((e) => isSameId(e?.tempId, deptId)
            ? { ...e, payload: { ...e.payload, [key]: value || null } } : e),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(deptId)]: mergeUpdatePatch(prev.updates?.[String(deptId)], { [key]: value || null }),
        },
      };
    });
  }, [isMutatingAction, isSaving]);

  return {
    decoratedCompanies, decoratedDepartments,
    dialog, companyDraft, departmentDraft, isSaving, isMutatingAction,
    pendingSummary, hasPendingChanges,
    pendingDeactivatedCompanyIds, pendingDeactivatedDepartmentIds,
    pendingHardDeletedCompanyIds, pendingHardDeletedDepartmentIds,
    selectedCompany, isSelectedCompanyPendingDeactivation, expandedCompanyId,
    setDialog, setCompanyDraft, setDepartmentDraft,
    handleCompanyRowClick, handleCancelBatch, handleSaveBatch, closeDialog,
    handleInlineEditCompany, handleInlineEditDepartment,
    editingCompanyId, startEditingCompany, stopEditingCompany,
    editingDeptId, startEditingDept, stopEditingDept,
    ...companyActions, ...deptActions,
  };
}

// ═══════════════════════════════════════════════════════════
//  LOCAL COMPONENTS
// ═══════════════════════════════════════════════════════════


function batchMarker(bs) {
  const map = {
    hardDeleted: { t: "Deleted", c: "psb-batch-marker psb-batch-marker-deleted" },
    deleted: { t: "Deactivated", c: "psb-batch-marker psb-batch-marker-deleted" },
    created: { t: "New", c: "psb-batch-marker psb-batch-marker-new" },
    updated: { t: "Edited", c: "psb-batch-marker psb-batch-marker-edited" },
  };
  return map[bs] || { t: "", c: "" };
}

function CompanyDeptHeader({
  hasPendingChanges, pendingSummary, isSaving, isMutatingAction,
  handleSaveBatch, handleCancelBatch,
  openAddCompanyDialog,
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Configuration and Settings</h1>
        <p className="text-muted mb-0">Manage setup tables and mapping assignments for Company-Department.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
          {isMutatingAction || isSaving
            ? "Saving batch..."
            : hasPendingChanges ? `${pendingSummary.total} staged change(s)` : "No changes"}
        </span>
        {hasPendingChanges ? (
          <>
            {pendingSummary.companyAdded + pendingSummary.departmentAdded > 0 ? (
              <span className="psb-batch-chip psb-batch-chip-added">+{pendingSummary.companyAdded + pendingSummary.departmentAdded} Added</span>
            ) : null}
            {pendingSummary.companyEdited + pendingSummary.departmentEdited > 0 ? (
              <span className="psb-batch-chip psb-batch-chip-edited">~{pendingSummary.companyEdited + pendingSummary.departmentEdited} Edited</span>
            ) : null}
            {pendingSummary.companyDeactivated + pendingSummary.departmentDeactivated > 0 ? (
              <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.companyDeactivated + pendingSummary.departmentDeactivated} Deactivated</span>
            ) : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSaving}
          disabled={!hasPendingChanges || isSaving || isMutatingAction} onClick={handleSaveBatch}>Save Batch</Button>
        <Button type="button" size="sm" variant="ghost"
          disabled={!hasPendingChanges || isSaving || isMutatingAction} onClick={handleCancelBatch}>Cancel Batch</Button>
        <Button type="button" size="sm" variant="success"
          disabled={isSaving || isMutatingAction} onClick={openAddCompanyDialog}>+ Add Company</Button>
      </div>
    </div>
  );
}

function CompanyTableSection({
  decoratedCompanies, decoratedDepartments, selectedCompany, expandedCompanyId, isSaving, isMutatingAction,
  pendingDeactivatedCompanyIds, pendingHardDeletedCompanyIds, handleCompanyRowClick,
  editingCompanyId, onStartEditing, onStopEditing, onInlineEdit,
  openToggleCompanyDialog, openDeactivateCompanyDialog, stageHardDeleteCompany, onUndoBatchAction,
  openAddDepartmentDialog,
  // department props
  pendingDeactivatedDepartmentIds, pendingHardDeletedDepartmentIds,
  editingDeptId, onStartEditingDept, onStopEditingDept, onInlineEditDept,
  openToggleDepartmentDialog, openDeactivateDepartmentDialog, stageHardDeleteDepartment, onUndoBatchActionDept,
}) {
  const columns = useMemo(() => [
    {
      key: "comp_name", label: "Company Name", width: "26%", sortable: true,
      render: (row) => {
        const m = batchMarker(row?.__batchState || "");
        const isEditing = String(row?.comp_id ?? "") === String(editingCompanyId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        const isSelected = isSameId(row?.comp_id, selectedCompany?.comp_id);
        return (
          <span className={isSelected ? "fw-semibold text-primary" : ""}>
            <InlineEditCell
              value={row?.comp_name || ""}
              onCommit={(val) => onInlineEdit?.(row, "comp_name", val)}
              onCancel={onStopEditing}
              disabled={editDisabled}
            />
            {m.t ? <span className={m.c}>{m.t}</span> : null}
          </span>
        );
      },
    },
    {
      key: "comp_short_name", label: "Short Name", width: "18%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.comp_id ?? "") === String(editingCompanyId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        return (
          <InlineEditCell
            value={row?.comp_short_name || ""}
            onCommit={(val) => onInlineEdit?.(row, "comp_short_name", val)}
            onCancel={onStopEditing}
            disabled={editDisabled}
          />
        );
      },
    },
    {
      key: "comp_email", label: "Email", width: "26%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.comp_id ?? "") === String(editingCompanyId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        return (
          <InlineEditCell
            value={row?.comp_email || ""}
            onCommit={(val) => onInlineEdit?.(row, "comp_email", val)}
            onCancel={onStopEditing}
            disabled={editDisabled}
          />
        );
      },
    },
    {
      key: "comp_phone", label: "Phone", width: "18%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.comp_id ?? "") === String(editingCompanyId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        return (
          <InlineEditCell
            value={row?.comp_phone || ""}
            onCommit={(val) => onInlineEdit?.(row, "comp_phone", val)}
            onCancel={onStopEditing}
            disabled={editDisabled}
          />
        );
      },
    },
    {
      key: "is_active_bool", label: "Active", width: "12%", sortable: true, align: "center",
      render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
    },
  ], [editingCompanyId, isMutatingAction, isSaving, onInlineEdit, onStopEditing, selectedCompany?.comp_id]);

  const actions = useMemo(() => [
    { key: "edit-company", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => String(r?.comp_id ?? "") !== String(editingCompanyId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => onStartEditing(r) },
    { key: "cancel-edit-company", label: "Cancel", type: "secondary", icon: "xmark",
      visible: (r) => String(r?.comp_id ?? "") === String(editingCompanyId ?? ""),
      onClick: () => onStopEditing() },
    { key: "restore-company", label: "Restore", type: "secondary", icon: "rotate-left",
      visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedCompanyIds.has(String(r?.comp_id ?? ""))) && String(r?.comp_id ?? "") !== String(editingCompanyId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => openToggleCompanyDialog(r) },
    { key: "deactivate-company", label: "Deactivate", type: "secondary", icon: "ban",
      visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedCompanyIds.has(String(r?.comp_id ?? "")) && String(r?.comp_id ?? "") !== String(editingCompanyId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => openDeactivateCompanyDialog(r) },
    { key: "delete-company", label: "Delete", type: "danger", icon: "trash",
      visible: (r) => String(r?.comp_id ?? "") !== String(editingCompanyId ?? ""),
      confirm: true,
      confirmMessage: (r) => `Permanently delete ${r?.comp_name || "this company"}? This action cannot be undone.`,
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => stageHardDeleteCompany(r) },
    { key: "add-department", label: "+ Add Dept", type: "success", icon: "plus",
      visible: (r) => String(r?.comp_id ?? "") !== String(editingCompanyId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: () => openAddDepartmentDialog() },
  ], [editingCompanyId, isMutatingAction, isSaving, onStartEditing, onStopEditing,
    openAddDepartmentDialog, openDeactivateCompanyDialog, openToggleCompanyDialog, pendingDeactivatedCompanyIds, stageHardDeleteCompany]);

  // ── Department columns for nested detail ──
  const deptColumns = useMemo(() => [
    {
      key: "dept_name", label: "Department Name", width: "48%", sortable: true,
      render: (row) => {
        const m = batchMarker(row?.__batchState || "");
        const isEditing = String(row?.dept_id ?? "") === String(editingDeptId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        return (
          <span>
            <InlineEditCell
              value={row?.dept_name || ""}
              onCommit={(val) => onInlineEditDept?.(row, "dept_name", val)}
              onCancel={onStopEditingDept}
              disabled={editDisabled}
            />
            {m.t ? <span className={m.c}>{m.t}</span> : null}
          </span>
        );
      },
    },
    {
      key: "dept_short_name", label: "Short Name", width: "30%", sortable: true,
      render: (row) => {
        const isEditing = String(row?.dept_id ?? "") === String(editingDeptId ?? "");
        const editDisabled = !isEditing || isSaving || isMutatingAction;
        return (
          <InlineEditCell
            value={row?.dept_short_name || ""}
            onCommit={(val) => onInlineEditDept?.(row, "dept_short_name", val)}
            onCancel={onStopEditingDept}
            disabled={editDisabled}
          />
        );
      },
    },
    {
      key: "is_active_bool", label: "Active", width: "22%", sortable: true, align: "center",
      render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
    },
  ], [editingDeptId, isMutatingAction, isSaving, onInlineEditDept, onStopEditingDept]);

  const deptActions = useMemo(() => [
    { key: "edit-department", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => String(r?.dept_id ?? "") !== String(editingDeptId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => onStartEditingDept(r) },
    { key: "cancel-edit-department", label: "Cancel", type: "secondary", icon: "xmark",
      visible: (r) => String(r?.dept_id ?? "") === String(editingDeptId ?? ""),
      onClick: () => onStopEditingDept() },
    { key: "restore-department", label: "Restore", type: "secondary", icon: "rotate-left",
      visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedDepartmentIds.has(String(r?.dept_id ?? ""))) && String(r?.dept_id ?? "") !== String(editingDeptId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => openToggleDepartmentDialog(r) },
    { key: "deactivate-department", label: "Deactivate", type: "secondary", icon: "ban",
      visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedDepartmentIds.has(String(r?.dept_id ?? "")) && String(r?.dept_id ?? "") !== String(editingDeptId ?? ""),
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => openDeactivateDepartmentDialog(r) },
    { key: "delete-department", label: "Delete", type: "danger", icon: "trash",
      visible: (r) => String(r?.dept_id ?? "") !== String(editingDeptId ?? ""),
      confirm: true,
      confirmMessage: (r) => `Permanently delete ${r?.dept_name || "this department"}? This action cannot be undone.`,
      disabled: (r) => isSaving || isMutatingAction,
      onClick: (r) => stageHardDeleteDepartment(r) },
  ], [editingDeptId, isMutatingAction, isSaving, onStartEditingDept, onStopEditingDept,
    openDeactivateDepartmentDialog, openToggleDepartmentDialog, pendingDeactivatedDepartmentIds, stageHardDeleteDepartment]);

  const renderCompanyDetail = useCallback(() => {
    if (!selectedCompany) return null;
    return (
      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0 small fw-semibold">Departments for: {selectedCompany.comp_name}</h6>
        </div>
        <TableZ columns={deptColumns} data={decoratedDepartments} rowIdKey="dept_id"
          actions={deptActions} hideFooter
          emptyMessage="No departments found for this company."
          onUndoBatchAction={onUndoBatchActionDept} />
      </div>
    );
  }, [deptActions, deptColumns, decoratedDepartments, onUndoBatchActionDept, selectedCompany]);

  return (
    <TableZ columns={columns} data={decoratedCompanies} rowIdKey="comp_id"
      selectedRowId={expandedCompanyId} onRowClick={handleCompanyRowClick}
      actions={actions} hideFooter
      renderDetail={renderCompanyDetail}
      emptyMessage="No companies found."
      onUndoBatchAction={onUndoBatchAction} />
  );
}

function CompanyDeptDialog({
  dialog, companyDraft, departmentDraft, isMutatingAction,
  setCompanyDraft, setDepartmentDraft, closeDialog,
  submitAddCompany, submitEditCompany, submitToggleCompany, submitDeactivateCompany,
  submitAddDepartment, submitEditDepartment, submitToggleDepartment, submitDeactivateDepartment,
}) {
  const kind = dialog?.kind;

  const dialogTitle = useMemo(() => {
    const titles = {
      "add-company": "Add Company", "edit-company": "Edit Company",
      "toggle-company": `${dialog?.nextIsActive ? "Enable" : "Disable"} Company`,
      "deactivate-company": "Deactivate Company",
      "add-department": "Add Department", "edit-department": "Edit Department",
      "toggle-department": `${dialog?.nextIsActive ? "Enable" : "Disable"} Department`,
      "deactivate-department": "Deactivate Department",
    };
    return titles[kind] || "";
  }, [kind, dialog?.nextIsActive]);

  if (!kind) return null;
  const isBusy = isMutatingAction;

  const submitMap = {
    "add-company": submitAddCompany, "edit-company": submitEditCompany,
    "toggle-company": submitToggleCompany, "deactivate-company": submitDeactivateCompany,
    "add-department": submitAddDepartment, "edit-department": submitEditDepartment,
    "toggle-department": submitToggleDepartment, "deactivate-department": submitDeactivateDepartment,
  };

  const fc = {
    "add-company": { label: "Add Company", variant: "success" },
    "edit-company": { label: "Save", variant: "primary" },
    "add-department": { label: "Add Department", variant: "success" },
    "edit-department": { label: "Save", variant: "primary" },
    "toggle-company": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" },
    "toggle-department": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" },
    "deactivate-company": { label: "Deactivate Company", variant: "warning" },
    "deactivate-department": { label: "Deactivate Department", variant: "warning" },
  }[kind] || { label: "OK", variant: "primary" };

  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
      <Button type="button" variant={fc.variant} onClick={submitMap[kind]} loading={isBusy}>{fc.label}</Button>
    </>
  );

  const isCompanyForm = kind === "add-company" || kind === "edit-company";
  const isDeptForm = kind === "add-department" || kind === "edit-department";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} footer={footer}>
      {isCompanyForm ? (
        <div className="d-flex flex-column gap-3">
          <div>
            <label className="form-label mb-1">Company Name</label>
            <Input value={companyDraft.name} onChange={(e) => setCompanyDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter company name" autoFocus />
          </div>
          <div>
            <label className="form-label mb-1">Short Name</label>
            <Input value={companyDraft.shortName} onChange={(e) => setCompanyDraft((p) => ({ ...p, shortName: e.target.value }))} placeholder="Enter short name" />
          </div>
          <div>
            <label className="form-label mb-1">Email</label>
            <Input value={companyDraft.email} onChange={(e) => setCompanyDraft((p) => ({ ...p, email: e.target.value }))} placeholder="Enter company email" />
          </div>
          <div>
            <label className="form-label mb-1">Phone</label>
            <Input value={companyDraft.phone} onChange={(e) => setCompanyDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Enter company phone" />
          </div>
        </div>
      ) : null}

      {isDeptForm ? (
        <div className="d-flex flex-column gap-3">
          {kind === "add-department" ? (
            <div className="small text-muted">Creating department for <strong>{dialog?.target?.comp_name || "selected company"}</strong></div>
          ) : null}
          <div>
            <label className="form-label mb-1">Department Name</label>
            <Input value={departmentDraft.name} onChange={(e) => setDepartmentDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter department name" autoFocus />
          </div>
          <div>
            <label className="form-label mb-1">Short Name</label>
            <Input value={departmentDraft.shortName} onChange={(e) => setDepartmentDraft((p) => ({ ...p, shortName: e.target.value }))} placeholder="Enter short name" />
          </div>
        </div>
      ) : null}

      {kind === "toggle-company" ? (
        <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} company <strong>{dialog?.target?.comp_name || ""}</strong>?</p>
      ) : null}

      {kind === "toggle-department" ? (
        <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} department <strong>{dialog?.target?.dept_name || ""}</strong>?</p>
      ) : null}

      {kind === "deactivate-company" ? (
        <p className="mb-0 text-danger">Deactivate company <strong>{dialog?.target?.comp_name || ""}</strong> and all linked departments?</p>
      ) : null}

      {kind === "deactivate-department" ? (
        <p className="mb-0 text-danger">Deactivate department <strong>{dialog?.target?.dept_name || ""}</strong>?</p>
      ) : null}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN VIEW
// ═══════════════════════════════════════════════════════════

export default function CompanyDepartmentSetupView({ companies, departments, initialSelectedCompanyId }) {
  const h = useCompanyDepartmentSetup({ companies, departments, initialSelectedCompanyId });

  return (
    <main className="container py-4">
      <CompanyDeptHeader
        hasPendingChanges={h.hasPendingChanges} pendingSummary={h.pendingSummary}
        isSaving={h.isSaving} isMutatingAction={h.isMutatingAction}
        handleSaveBatch={h.handleSaveBatch} handleCancelBatch={h.handleCancelBatch}
        openAddCompanyDialog={h.openAddCompanyDialog}
      />

      <CompanyTableSection
        decoratedCompanies={h.decoratedCompanies} decoratedDepartments={h.decoratedDepartments}
        selectedCompany={h.selectedCompany} expandedCompanyId={h.expandedCompanyId}
        isSaving={h.isSaving} isMutatingAction={h.isMutatingAction}
        pendingDeactivatedCompanyIds={h.pendingDeactivatedCompanyIds}
        pendingHardDeletedCompanyIds={h.pendingHardDeletedCompanyIds}
        handleCompanyRowClick={h.handleCompanyRowClick}
        editingCompanyId={h.editingCompanyId}
        onStartEditing={h.startEditingCompany}
        onStopEditing={h.stopEditingCompany}
        onInlineEdit={h.handleInlineEditCompany}
        openToggleCompanyDialog={h.openToggleCompanyDialog}
        openDeactivateCompanyDialog={h.openDeactivateCompanyDialog}
        stageHardDeleteCompany={h.stageHardDeleteCompany}
        onUndoBatchAction={h.unstageHardDeleteCompany}
        openAddDepartmentDialog={h.openAddDepartmentDialog}
        pendingDeactivatedDepartmentIds={h.pendingDeactivatedDepartmentIds}
        pendingHardDeletedDepartmentIds={h.pendingHardDeletedDepartmentIds}
        editingDeptId={h.editingDeptId}
        onStartEditingDept={h.startEditingDept}
        onStopEditingDept={h.stopEditingDept}
        onInlineEditDept={h.handleInlineEditDepartment}
        openToggleDepartmentDialog={h.openToggleDepartmentDialog}
        openDeactivateDepartmentDialog={h.openDeactivateDepartmentDialog}
        stageHardDeleteDepartment={h.stageHardDeleteDepartment}
        onUndoBatchActionDept={h.unstageHardDeleteDepartment}
      />

      <CompanyDeptDialog
        dialog={h.dialog} companyDraft={h.companyDraft} departmentDraft={h.departmentDraft}
        isMutatingAction={h.isMutatingAction}
        setCompanyDraft={h.setCompanyDraft} setDepartmentDraft={h.setDepartmentDraft} closeDialog={h.closeDialog}
        submitAddCompany={h.submitAddCompany} submitEditCompany={h.submitEditCompany}
        submitToggleCompany={h.submitToggleCompany} submitDeactivateCompany={h.submitDeactivateCompany}
        submitAddDepartment={h.submitAddDepartment} submitEditDepartment={h.submitEditDepartment}
        submitToggleDepartment={h.submitToggleDepartment} submitDeactivateDepartment={h.submitDeactivateDepartment}
      />
    </main>
  );
}
