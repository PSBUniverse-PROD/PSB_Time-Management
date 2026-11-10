"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Modal, toastError, toastSuccess } from "@/shared/components/ui";
import {
  parseCompanyId, isSameId, compareText, normalizeText, mapCompanyRow, mapDepartmentRow,
  removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_COMPANY_PREFIX, TEMP_DEPARTMENT_PREFIX,
  createTempId, isTempCompanyId, isTempDepartmentId,
  createEmptyCompanyChanges, createEmptyDepartmentChanges,
  executeBatchSave, remapDepartmentsByCompanyId,
} from "../data/companyDepartmentSetup.data.js";
import {
  deleteOrgPositionAction,
  loadOrgPositionsData,
  moveOrgPositionAction,
  saveOrgPositionAction,
  setOrgPositionActiveAction,
} from "../data/companyDepartmentSetup.actions.js";
import PositionModal from "./PositionModal.jsx";
import RanksModal from "./RanksModal.jsx";
import OrgFlowSection, { COMPANY_LEVEL_KEY } from "./OrgFlowSection.jsx";
import orgChartModule from "@/modules/admin/org-chart/index.js";

const ORG_CHART_PATH = orgChartModule?.routes?.[0]?.path || "";

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
    } finally { setIsMutatingAction(false); setIsSaving(false); }
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

  return {
    decoratedCompanies, decoratedDepartments,
    dialog, companyDraft, departmentDraft, isSaving, isMutatingAction,
    pendingSummary, hasPendingChanges,
    pendingDeactivatedCompanyIds, pendingDeactivatedDepartmentIds,
    pendingHardDeletedCompanyIds, pendingHardDeletedDepartmentIds,
    selectedCompany, isSelectedCompanyPendingDeactivation, expandedCompanyId,
    setDialog, setCompanyDraft, setDepartmentDraft,
    handleCompanyRowClick, handleCancelBatch, handleSaveBatch, closeDialog,
    ...companyActions, ...deptActions,
  };
}

// ═══════════════════════════════════════════════════════════
//  LOCAL COMPONENTS
// ═══════════════════════════════════════════════════════════


function CompanyDeptHeader({
  hasPendingChanges, pendingSummary, isSaving, isMutatingAction,
  handleSaveBatch, handleCancelBatch,
  openAddCompanyDialog, onOpenRanks,
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Organization Setup</h1>
        <p className="text-muted mb-0">Pick a company, then a department, then a position. The org chart is drawn from what you set here.</p>
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
        <Button type="button" size="sm" variant="secondary" onClick={onOpenRanks}>Ranks</Button>
        <a href={ORG_CHART_PATH} className="btn btn-sm btn-outline-primary">Org Chart</a>
      </div>
    </div>
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

export default function CompanyDepartmentSetupView({ companies, departments, initialSelectedCompanyId, positions = [], users = [], ranks = [] }) {
  const h = useCompanyDepartmentSetup({ companies, departments, initialSelectedCompanyId });
  const [org, setOrg] = useState({ positions, users, ranks });
  const [showRanks, setShowRanks] = useState(false);

  useEffect(() => {
    setOrg({ positions, users, ranks });
  }, [positions, users, ranks]);
  const [positionModal, setPositionModal] = useState(null);
  const [isPositionBusy, setIsPositionBusy] = useState(false);
  // Flow selection: department (or COMPANY_LEVEL_KEY) and position inside the selected company.
  const [selectedDeptKey, setSelectedDeptKey] = useState(null);
  const [selectedPositionId, setSelectedPositionId] = useState(null);
  const selectedCompanyId = h.selectedCompany?.comp_id ?? null;

  useEffect(() => {
    setSelectedDeptKey(null);
    setSelectedPositionId(null);
  }, [selectedCompanyId]);

  const reloadOrg = useCallback(async () => {
    const next = await loadOrgPositionsData();
    setOrg({ positions: next?.positions || [], users: next?.users || [], ranks: next?.ranks || [] });
  }, []);

  const companyPositions = useMemo(
    () => org.positions.filter((p) => isSameId(p?.comp_id, h.selectedCompany?.comp_id)),
    [h.selectedCompany?.comp_id, org.positions]);
  const savedCompanyDepartments = useMemo(
    () => (h.decoratedDepartments || []).filter((d) => !isTempDepartmentId(d?.dept_id)),
    [h.decoratedDepartments]);

  const runPositionChange = useCallback(async (work, message) => {
    if (isPositionBusy) return;
    setIsPositionBusy(true);
    try {
      const result = await work();
      if (result && result.success === false) throw new Error(result.error || "Failed to update the position.");
      await reloadOrg();
      toastSuccess(message, "Positions");
    } catch (error) {
      toastError(error?.message || "Failed to update the position.");
    } finally {
      setIsPositionBusy(false);
    }
  }, [isPositionBusy, reloadOrg]);

  const handlePositionSaved = useCallback(async (message) => {
    await reloadOrg();
    setPositionModal(null);
    toastSuccess(message, "Positions");
  }, [reloadOrg]);

  return (
    <main className="container-fluid py-4 px-3 px-lg-4">
      <CompanyDeptHeader
        hasPendingChanges={h.hasPendingChanges} pendingSummary={h.pendingSummary}
        isSaving={h.isSaving} isMutatingAction={h.isMutatingAction}
        handleSaveBatch={h.handleSaveBatch} handleCancelBatch={h.handleCancelBatch}
        openAddCompanyDialog={h.openAddCompanyDialog}
        onOpenRanks={() => setShowRanks(true)}
      />

      <OrgFlowSection
        decoratedCompanies={h.decoratedCompanies} decoratedDepartments={h.decoratedDepartments}
        selectedCompany={h.selectedCompany}
        isSaving={h.isSaving} isMutatingAction={h.isMutatingAction}
        pendingDeactivatedCompanyIds={h.pendingDeactivatedCompanyIds}
        pendingDeactivatedDepartmentIds={h.pendingDeactivatedDepartmentIds}
        onSelectCompany={h.handleCompanyRowClick}
        openAddCompanyDialog={h.openAddCompanyDialog}
        openEditCompanyDialog={h.openEditCompanyDialog}
        openToggleCompanyDialog={h.openToggleCompanyDialog}
        openDeactivateCompanyDialog={h.openDeactivateCompanyDialog}
        stageHardDeleteCompany={h.stageHardDeleteCompany}
        unstageHardDeleteCompany={h.unstageHardDeleteCompany}
        openAddDepartmentDialog={h.openAddDepartmentDialog}
        openEditDepartmentDialog={h.openEditDepartmentDialog}
        openToggleDepartmentDialog={h.openToggleDepartmentDialog}
        openDeactivateDepartmentDialog={h.openDeactivateDepartmentDialog}
        stageHardDeleteDepartment={h.stageHardDeleteDepartment}
        unstageHardDeleteDepartment={h.unstageHardDeleteDepartment}
        allPositions={org.positions}
        companyPositions={companyPositions}
        isPositionBusy={isPositionBusy}
        ranks={org.ranks}
        selectedDeptKey={selectedDeptKey}
        onSelectDept={(key) => { setSelectedDeptKey(key); setSelectedPositionId(null); }}
        selectedPositionId={selectedPositionId}
        onSelectPosition={(id) => setSelectedPositionId(id)}
        onAddPosition={() => setPositionModal({ position: null })}
        onEditPosition={(row) => setPositionModal({ position: row })}
        onTogglePosition={(row, nextActive) => runPositionChange(
          () => setOrgPositionActiveAction(row.position_id, nextActive),
          nextActive ? "Position restored." : "Position deactivated.")}
        onDeletePosition={(row) => runPositionChange(
          () => deleteOrgPositionAction(row.position_id), "Position deleted.")}
        onMovePosition={(row, direction) => runPositionChange(
          () => moveOrgPositionAction(row.position_id, direction), "Order updated.")}
        onRemovePerson={(row, userId) => runPositionChange(
          () => saveOrgPositionAction({
            position_id: row.position_id,
            comp_id: row.comp_id,
            dept_id: row.dept_id,
            position_name: row.position_name,
            branch: row.branch,
            chart_level: row.chart_level,
            reports_to_ids: row.reports_to_ids || [],
            user_ids: (row.holders || []).map((x) => x.user_id).filter((id) => !isSameId(id, userId)),
          }),
          "Person removed.")}
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

      {positionModal && h.selectedCompany ? (
        <PositionModal
          key={String(positionModal.position?.position_id ?? "new")}
          company={h.selectedCompany}
          position={positionModal.position}
          departments={savedCompanyDepartments}
          positions={companyPositions}
          users={org.users}
          ranks={org.ranks}
          defaultDeptId={selectedDeptKey && selectedDeptKey !== COMPANY_LEVEL_KEY ? selectedDeptKey : ""}
          onClose={() => setPositionModal(null)}
          onSaved={handlePositionSaved}
        />
      ) : null}

      <RanksModal show={showRanks} ranks={org.ranks} onClose={() => setShowRanks(false)} onChanged={reloadOrg} />
    </main>
  );
}
