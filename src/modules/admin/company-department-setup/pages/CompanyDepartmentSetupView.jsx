"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Modal, toastError, toastSuccess } from "@/shared/components/ui";
import {
  parseCompanyId, isSameId, compareText, normalizeText, mapCompanyRow, mapDepartmentRow, EMPTY_DIALOG,
} from "../data/companyDepartmentSetup.data.js";
import {
  deleteCompanyAction,
  deleteDepartmentAction,
  deleteOrgPositionAction,
  loadOrgPositionsData,
  moveOrgPositionAction,
  saveCompanyAction,
  saveDepartmentAction,
  saveOrgPositionAction,
  setCompanyActiveAction,
  setDepartmentActiveAction,
  setOrgPositionActiveAction,
} from "../data/companyDepartmentSetup.actions.js";
import PositionModal from "./PositionModal.jsx";
import RanksModal from "./RanksModal.jsx";
import OrgFlowSection, { COMPANY_LEVEL_KEY } from "./OrgFlowSection.jsx";
import orgChartModule from "@/modules/admin/org-chart/index.js";

const ORG_CHART_PATH = orgChartModule?.routes?.[0]?.path || "";
const EMPTY_COMPANY_DRAFT = { name: "", shortName: "", email: "", phone: "" };
const EMPTY_DEPARTMENT_DRAFT = { name: "", shortName: "" };

// ═══════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════

function sortCompanies(rows) {
  return (Array.isArray(rows) ? rows : []).map((c, i) => mapCompanyRow(c, i)).sort((a, b) => compareText(a.comp_name, b.comp_name));
}

function sortDepartments(rows) {
  return (Array.isArray(rows) ? rows : []).map((d, i) => mapDepartmentRow(d, i)).sort((a, b) => compareText(a.dept_name, b.dept_name));
}

// Empty fields show as "--" on the rows; the edit form starts empty for them.
function fieldText(value) {
  const text = String(value ?? "").trim();
  return text === "--" ? "" : text;
}
// ═══════════════════════════════════════════════════════════
//  HOOKS
// ═══════════════════════════════════════════════════════════

function useCompanyActions({
  isBusy, runChange, dialog, companyDraft, companyRows, selectedCompanyId,
  setCompanyRows, setDepartmentRows, setDialog, setCompanyDraft, updateSelectedCompanyInQuery,
}) {
  const openAddCompanyDialog = useCallback(() => {
    if (isBusy) return;
    setCompanyDraft(EMPTY_COMPANY_DRAFT);
    setDialog({ kind: "add-company", target: null, nextIsActive: true });
  }, [isBusy, setCompanyDraft, setDialog]);

  const openEditCompanyDialog = useCallback((row) => {
    if (isBusy) return;
    setCompanyDraft({
      name: fieldText(row?.comp_name), shortName: fieldText(row?.comp_short_name),
      email: fieldText(row?.comp_email), phone: fieldText(row?.comp_phone),
    });
    setDialog({ kind: "edit-company", target: row, nextIsActive: null });
  }, [isBusy, setCompanyDraft, setDialog]);

  const openToggleCompanyDialog = useCallback((row) => {
    if (isBusy) return;
    setDialog({ kind: "toggle-company", target: row, nextIsActive: !row?.is_active_bool });
  }, [isBusy, setDialog]);

  const openDeactivateCompanyDialog = useCallback((row) => {
    if (isBusy) return;
    setDialog({ kind: "deactivate-company", target: row, nextIsActive: null });
  }, [isBusy, setDialog]);

  // Add or Edit (same form).
  const submitCompanyForm = useCallback(async () => {
    const isEdit = dialog?.kind === "edit-company";
    if (isEdit && dialog?.target?.comp_id == null) { toastError("Invalid company."); return; }
    const companyName = normalizeText(companyDraft.name);
    if (!companyName) { toastError("Company name is required."); return; }

    const result = await runChange(() => saveCompanyAction({
      comp_id: isEdit ? dialog.target.comp_id : null,
      comp_name: companyName,
      comp_short_name: normalizeText(companyDraft.shortName),
      comp_email: normalizeText(companyDraft.email),
      comp_phone: normalizeText(companyDraft.phone),
    }), isEdit ? "Company saved." : "Company added.");
    const saved = result?.company;
    if (!saved) return;

    setCompanyRows((prev) => sortCompanies(isEdit
      ? prev.map((c) => (isSameId(c?.comp_id, saved.comp_id) ? saved : c))
      : [...prev, saved]));
    setCompanyDraft(EMPTY_COMPANY_DRAFT);
    if (!isEdit) updateSelectedCompanyInQuery(saved.comp_id);
  }, [companyDraft, dialog, runChange, setCompanyDraft, setCompanyRows, updateSelectedCompanyInQuery]);

  // Restore (toggle-company) or Deactivate (deactivate-company).
  const submitCompanyActive = useCallback(async () => {
    const row = dialog?.target;
    if (row?.comp_id == null) { toastError("Invalid company."); return; }
    const isActive = dialog?.kind === "toggle-company" ? Boolean(dialog?.nextIsActive) : false;

    const result = await runChange(() => setCompanyActiveAction(row.comp_id, isActive),
      isActive ? "Company restored." : "Company and its departments deactivated.", { seatsMayChange: true });
    const saved = result?.company;
    if (!saved) return;

    setCompanyRows((prev) => sortCompanies(prev.map((c) => (isSameId(c?.comp_id, saved.comp_id) ? saved : c))));
    if (!isActive) {
      setDepartmentRows((prev) => prev.map((d, i) => (isSameId(d?.comp_id, saved.comp_id)
        ? mapDepartmentRow({ ...d, is_active: false }, i) : d)));
    }
  }, [dialog, runChange, setCompanyRows, setDepartmentRows]);

  // Called after the Delete confirm in OrgFlowSection.
  const deleteCompany = useCallback(async (row) => {
    if (row?.comp_id == null) return false;
    const result = await runChange(() => deleteCompanyAction(row.comp_id), "Company deleted.");
    if (!result) return false;

    const remaining = companyRows.filter((c) => !isSameId(c?.comp_id, row.comp_id));
    setCompanyRows(remaining);
    setDepartmentRows((prev) => prev.filter((d) => !isSameId(d?.comp_id, row.comp_id)));
    if (isSameId(selectedCompanyId, row.comp_id)) updateSelectedCompanyInQuery(remaining[0]?.comp_id ?? null);
    return true;
  }, [companyRows, runChange, selectedCompanyId, setCompanyRows, setDepartmentRows, updateSelectedCompanyInQuery]);

  return {
    openAddCompanyDialog, openEditCompanyDialog, openToggleCompanyDialog, openDeactivateCompanyDialog,
    submitCompanyForm, submitCompanyActive, deleteCompany,
  };
}
function useDepartmentActions({
  isBusy, runChange, dialog, departmentDraft, selectedCompany,
  setDepartmentRows, setDialog, setDepartmentDraft,
}) {
  const openAddDepartmentDialog = useCallback(() => {
    if (isBusy) return;
    if (!selectedCompany?.comp_id) { toastError("Select a company before adding a department."); return; }
    setDepartmentDraft(EMPTY_DEPARTMENT_DRAFT);
    setDialog({ kind: "add-department", target: { comp_id: selectedCompany.comp_id, comp_name: selectedCompany.comp_name }, nextIsActive: true });
  }, [isBusy, selectedCompany, setDepartmentDraft, setDialog]);

  const openEditDepartmentDialog = useCallback((row) => {
    if (isBusy) return;
    setDepartmentDraft({ name: fieldText(row?.dept_name), shortName: fieldText(row?.dept_short_name) });
    setDialog({ kind: "edit-department", target: row, nextIsActive: null });
  }, [isBusy, setDepartmentDraft, setDialog]);

  const openToggleDepartmentDialog = useCallback((row) => {
    if (isBusy) return;
    setDialog({ kind: "toggle-department", target: row, nextIsActive: !row?.is_active_bool });
  }, [isBusy, setDialog]);

  const openDeactivateDepartmentDialog = useCallback((row) => {
    if (isBusy) return;
    setDialog({ kind: "deactivate-department", target: row, nextIsActive: null });
  }, [isBusy, setDialog]);

  // Add or Edit (same form).
  const submitDepartmentForm = useCallback(async () => {
    const isEdit = dialog?.kind === "edit-department";
    const target = dialog?.target;
    if (isEdit && target?.dept_id == null) { toastError("Invalid department."); return; }
    if (!isEdit && target?.comp_id == null) { toastError("Select a company before adding a department."); return; }
    const deptName = normalizeText(departmentDraft.name);
    if (!deptName) { toastError("Department name is required."); return; }

    const result = await runChange(() => saveDepartmentAction({
      dept_id: isEdit ? target.dept_id : null,
      comp_id: target.comp_id,
      dept_name: deptName,
      dept_short_name: normalizeText(departmentDraft.shortName),
    }), isEdit ? "Department saved." : "Department added.");
    const saved = result?.department;
    if (!saved) return;

    setDepartmentRows((prev) => sortDepartments(isEdit
      ? prev.map((d) => (isSameId(d?.dept_id, saved.dept_id) ? saved : d))
      : [...prev, saved]));
    setDepartmentDraft(EMPTY_DEPARTMENT_DRAFT);
  }, [departmentDraft, dialog, runChange, setDepartmentDraft, setDepartmentRows]);

  // Restore (toggle-department) or Deactivate (deactivate-department).
  const submitDepartmentActive = useCallback(async () => {
    const row = dialog?.target;
    if (row?.dept_id == null) { toastError("Invalid department."); return; }
    const isActive = dialog?.kind === "toggle-department" ? Boolean(dialog?.nextIsActive) : false;

    const result = await runChange(() => setDepartmentActiveAction(row.dept_id, isActive),
      isActive ? "Department restored." : "Department deactivated.", { seatsMayChange: true });
    const saved = result?.department;
    if (!saved) return;

    setDepartmentRows((prev) => sortDepartments(prev.map((d) => (isSameId(d?.dept_id, saved.dept_id) ? saved : d))));
  }, [dialog, runChange, setDepartmentRows]);

  // Called after the Delete confirm in OrgFlowSection. Returns true when deleted.
  const deleteDepartment = useCallback(async (row) => {
    if (row?.dept_id == null) return false;
    const result = await runChange(() => deleteDepartmentAction(row.dept_id), "Department deleted.");
    if (!result) return false;
    setDepartmentRows((prev) => prev.filter((d) => !isSameId(d?.dept_id, row.dept_id)));
    return true;
  }, [runChange, setDepartmentRows]);

  return {
    openAddDepartmentDialog, openEditDepartmentDialog, openToggleDepartmentDialog, openDeactivateDepartmentDialog,
    submitDepartmentForm, submitDepartmentActive, deleteDepartment,
  };
}
function useCompanyDepartmentSetup({ companies = [], departments = [], initialSelectedCompanyId = null, onSeatsChanged }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seedCompanies = useMemo(() => sortCompanies(companies), [companies]);
  const seedDepartments = useMemo(() => sortDepartments(departments), [departments]);

  // Local copies so a saved change shows at once; router.refresh() then reloads
  // the page data, which replaces them.
  const [companyRows, setCompanyRows] = useState(seedCompanies);
  const [departmentRows, setDepartmentRows] = useState(seedDepartments);
  const [isBusy, setIsBusy] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [companyDraft, setCompanyDraft] = useState(EMPTY_COMPANY_DRAFT);
  const [departmentDraft, setDepartmentDraft] = useState(EMPTY_DEPARTMENT_DRAFT);

  const [selectedCompanyId, setSelectedCompanyId] = useState(() => {
    const fromQ = parseCompanyId(searchParams?.get("company"));
    if (fromQ !== null) return fromQ;
    if (initialSelectedCompanyId != null && initialSelectedCompanyId !== "") return initialSelectedCompanyId;
    return seedCompanies[0]?.comp_id ?? null;
  });

  useEffect(() => { setCompanyRows(seedCompanies); }, [seedCompanies]);
  useEffect(() => { setDepartmentRows(seedDepartments); }, [seedDepartments]);
  useEffect(() => {
    const qId = parseCompanyId(searchParams?.get("company"));
    setSelectedCompanyId(qId ?? initialSelectedCompanyId ?? seedCompanies[0]?.comp_id ?? null);
  }, [initialSelectedCompanyId, searchParams, seedCompanies]);

  const selectedCompany = useMemo(
    () => companyRows.find((c) => isSameId(c?.comp_id, selectedCompanyId)) ?? null, [companyRows, selectedCompanyId]);

  const selectedCompanyDepartments = useMemo(() => {
    if (!selectedCompany?.comp_id) return [];
    return departmentRows.filter((d) => isSameId(d?.comp_id, selectedCompany.comp_id)).sort((a, b) => compareText(a.dept_name, b.dept_name));
  }, [departmentRows, selectedCompany?.comp_id]);

  const updateSelectedCompanyInQuery = useCallback((companyId) => {
    const p = new URLSearchParams(searchParams?.toString() || "");
    if (companyId == null || companyId === "") p.delete("company"); else p.set("company", String(companyId));
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    setSelectedCompanyId(companyId ?? null);
  }, [pathname, router, searchParams]);

  const closeDialog = useCallback(() => { if (!isBusy) setDialog(EMPTY_DIALOG); }, [isBusy]);

  const handleCompanyRowClick = useCallback((row) => {
    if (isBusy) return;
    updateSelectedCompanyInQuery(row?.comp_id);
  }, [isBusy, updateSelectedCompanyInQuery]);

  // Saves one change straight away. Returns the action result, or null when it
  // failed (an error toast is shown and the dialog stays open).
  const runChange = useCallback(async (work, message, { seatsMayChange = false } = {}) => {
    if (isBusy) return null;
    setIsBusy(true);
    try {
      const result = await work();
      if (!result || result.success === false) throw new Error(result?.error || "Failed to save the change.");
      setDialog(EMPTY_DIALOG);
      toastSuccess(message, "Organization");
      router.refresh();
      if (seatsMayChange && typeof onSeatsChanged === "function") {
        // People's main seats may have moved; reload the positions so the screen shows it.
        try { await onSeatsChanged(); } catch {
          toastError("Saved, but the positions list could not be reloaded. Refresh the page.");
        }
      }
      return result;
    } catch (error) {
      toastError(error?.message || "Failed to save the change.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, onSeatsChanged, router]);

  const companyActions = useCompanyActions({
    isBusy, runChange, dialog, companyDraft, companyRows, selectedCompanyId,
    setCompanyRows, setDepartmentRows, setDialog, setCompanyDraft, updateSelectedCompanyInQuery,
  });

  const deptActions = useDepartmentActions({
    isBusy, runChange, dialog, departmentDraft, selectedCompany,
    setDepartmentRows, setDialog, setDepartmentDraft,
  });

  return {
    companies: companyRows, departments: selectedCompanyDepartments, selectedCompany,
    dialog, companyDraft, departmentDraft, isBusy,
    setCompanyDraft, setDepartmentDraft, closeDialog, handleCompanyRowClick,
    ...companyActions, ...deptActions,
  };
}
// ═══════════════════════════════════════════════════════════
//  LOCAL COMPONENTS
// ═══════════════════════════════════════════════════════════


function CompanyDeptHeader({ isBusy, onOpenRanks }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Organization Setup</h1>
        <p className="text-muted mb-0">Pick a company, then a department, then a position. Changes save right away, and the org chart is drawn from what you set here.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        {isBusy ? <span className="small text-muted">Saving...</span> : null}
        <Button type="button" size="sm" variant="secondary" onClick={onOpenRanks}>Ranks</Button>
        <a href={ORG_CHART_PATH} className="btn btn-sm btn-outline-primary">Org Chart</a>
      </div>
    </div>
  );
}
function CompanyDeptDialog({
  dialog, companyDraft, departmentDraft, isBusy,
  setCompanyDraft, setDepartmentDraft, closeDialog,
  submitCompanyForm, submitCompanyActive, submitDepartmentForm, submitDepartmentActive,
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

  const submitMap = {
    "add-company": submitCompanyForm, "edit-company": submitCompanyForm,
    "toggle-company": submitCompanyActive, "deactivate-company": submitCompanyActive,
    "add-department": submitDepartmentForm, "edit-department": submitDepartmentForm,
    "toggle-department": submitDepartmentActive, "deactivate-department": submitDepartmentActive,
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
          <div className="small text-muted">
            {kind === "edit-company" && dialog?.target?.comp_code
              ? <>Code <strong>{dialog.target.comp_code}</strong>, given automatically and can&apos;t be changed.</>
              : "A company code is given automatically when you save."}
          </div>
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
          <div className="small text-muted">
            {kind === "edit-department" && dialog?.target?.dept_code
              ? <>Code <strong>{dialog.target.dept_code}</strong>, given automatically and can&apos;t be changed.</>
              : "A department code is given automatically when you save."}
          </div>
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
        <p className="mb-0">
          {dialog?.nextIsActive ? "Enable" : "Disable"} company <strong>{dialog?.target?.comp_name || ""}</strong>?
          {dialog?.nextIsActive ? " Its departments stay inactive until you restore them one by one." : ""}
        </p>
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
  const [org, setOrg] = useState({ positions, users, ranks });
  const [showRanks, setShowRanks] = useState(false);

  useEffect(() => {
    setOrg({ positions, users, ranks });
  }, [positions, users, ranks]);

  const reloadOrg = useCallback(async () => {
    const next = await loadOrgPositionsData();
    setOrg({ positions: next?.positions || [], users: next?.users || [], ranks: next?.ranks || [] });
  }, []);

  const h = useCompanyDepartmentSetup({ companies, departments, initialSelectedCompanyId, onSeatsChanged: reloadOrg });
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

  const companyPositions = useMemo(
    () => org.positions.filter((p) => isSameId(p?.comp_id, h.selectedCompany?.comp_id)),
    [h.selectedCompany?.comp_id, org.positions]);

  // Returns true when the change saved. Uses the fresh data the action sends
  // back (one round trip); falls back to a reload for actions that don't.
  const runPositionChange = useCallback(async (work, message) => {
    if (isPositionBusy) return false;
    setIsPositionBusy(true);
    try {
      const result = await work();
      if (result && result.success === false) throw new Error(result.error || "Failed to update the position.");
      if (result?.org) {
        setOrg({ positions: result.org.positions || [], users: result.org.users || [], ranks: result.org.ranks || [] });
      } else {
        await reloadOrg();
      }
      toastSuccess(message, "Positions");
      return true;
    } catch (error) {
      toastError(error?.message || "Failed to update the position.");
      return false;
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
      <CompanyDeptHeader isBusy={h.isBusy || isPositionBusy} onOpenRanks={() => setShowRanks(true)} />

      <OrgFlowSection
        decoratedCompanies={h.companies} decoratedDepartments={h.departments}
        selectedCompany={h.selectedCompany}
        isBusy={h.isBusy}
        onSelectCompany={h.handleCompanyRowClick}
        openAddCompanyDialog={h.openAddCompanyDialog}
        openEditCompanyDialog={h.openEditCompanyDialog}
        openToggleCompanyDialog={h.openToggleCompanyDialog}
        openDeactivateCompanyDialog={h.openDeactivateCompanyDialog}
        deleteCompany={h.deleteCompany}
        openAddDepartmentDialog={h.openAddDepartmentDialog}
        openEditDepartmentDialog={h.openEditDepartmentDialog}
        openToggleDepartmentDialog={h.openToggleDepartmentDialog}
        openDeactivateDepartmentDialog={h.openDeactivateDepartmentDialog}
        deleteDepartment={async (row) => {
          const deleted = await h.deleteDepartment(row);
          if (deleted && isSameId(selectedDeptKey, row?.dept_id)) { setSelectedDeptKey(null); setSelectedPositionId(null); }
        }}
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
        onDeletePosition={async (row) => {
          const deleted = await runPositionChange(
            () => deleteOrgPositionAction(row.position_id), "Position deleted.");
          if (deleted && isSameId(selectedPositionId, row.position_id)) setSelectedPositionId(null);
        }}
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
        isBusy={h.isBusy}
        setCompanyDraft={h.setCompanyDraft} setDepartmentDraft={h.setDepartmentDraft} closeDialog={h.closeDialog}
        submitCompanyForm={h.submitCompanyForm} submitCompanyActive={h.submitCompanyActive}
        submitDepartmentForm={h.submitDepartmentForm} submitDepartmentActive={h.submitDepartmentActive}
      />

      {positionModal && h.selectedCompany ? (
        <PositionModal
          key={String(positionModal.position?.position_id ?? "new")}
          company={h.selectedCompany}
          position={positionModal.position}
          departments={h.departments}
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