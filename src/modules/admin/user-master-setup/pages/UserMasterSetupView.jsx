"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark, faCheck } from "@fortawesome/free-solid-svg-icons";
import { Badge, Button, Card, Input, Modal, StatusBadge, TableZ, toastError, toastInfo, toastSuccess, toastWarning } from "@/shared/components/ui";
import {
  TABS, EMPTY_LOOKUPS, normalizeText, normalizeOptionalText, asChoiceValue, rowIdOf, isTemporaryId,
  isTruthy, inferActiveFromStatus, formatDateTime,
  createEmptyForm, createFormFromUser, cloneForm, cloneAccessRows, findLabel,
  summarizeUserRow, makeLocalAccessRow, diffAccessRows, buildUserPayload,
  buildPanelSnapshot, pendingBatchCount, replaceObjectKeyWithArray, removeObjectKey,
  createEmptyPendingBatch,
  executeBatchSave, executeDeactivateUser, fetchLookups, fetchUsers, fetchUserDetail,
} from "../data/userMasterSetup.data.js";

// ═══════════════════════════════════════════════════════════
//  HOOKS
// ═══════════════════════════════════════════════════════════

const EMPTY_ACCESS_EDITOR = { mode: null, access_key: null, original_app_id: "", original_role_id: "", app_id: "", role_id: "" };

function useUserPanel({
  lookups, tableRows, selectedUserRow, pendingBatch,
  setTableRows, setPendingBatch, refreshUsers,
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState("view");
  const [panelUserId, setPanelUserId] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [isPanelLoading, setIsPanelLoading] = useState(false);

  const [form, setForm] = useState(createEmptyForm());
  const [baselineForm, setBaselineForm] = useState(createEmptyForm());
  const [accessRows, setAccessRows] = useState([]);
  const [baselineAccessRows, setBaselineAccessRows] = useState([]);

  const [enableNewPassword, setEnableNewPassword] = useState(false);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [baselineSnapshot, setBaselineSnapshot] = useState(buildPanelSnapshot(createEmptyForm(), [], false, "", ""));

  const [showDiscardDraftModal, setShowDiscardDraftModal] = useState(false);
  const [pendingDiscardDraftAction, setPendingDiscardDraftAction] = useState(null);
  const [pendingAccessDeactivateRow, setPendingAccessDeactivateRow] = useState(null);
  const [accessEditor, setAccessEditor] = useState(EMPTY_ACCESS_EDITOR);

  const panelSnapshot = buildPanelSnapshot(form, accessRows, enableNewPassword, newPasswordValue, confirmNewPassword);
  const panelDirty = panelOpen && panelSnapshot !== baselineSnapshot;
  const panelEditable = panelMode === "edit" || panelMode === "add";
  const canDeactivateCurrentUser = panelMode !== "add" && normalizeText(panelUserId) !== "" && !isTemporaryId(panelUserId);

  const resetPanelState = useCallback(() => {
    const f = createEmptyForm();
    setPanelOpen(false); setPanelMode("view"); setPanelUserId(null); setActiveTab("profile");
    setForm(f); setBaselineForm(f); setAccessRows([]); setBaselineAccessRows([]);
    setEnableNewPassword(false); setNewPasswordValue(""); setConfirmNewPassword("");
    setAccessEditor(EMPTY_ACCESS_EDITOR);
    setBaselineSnapshot(buildPanelSnapshot(f, [], false, "", "")); setIsPanelLoading(false);
  }, []);

  function requestDiscardDraftConfirmation(onConfirm) {
    if (!panelDirty) { onConfirm(); return; }
    setPendingDiscardDraftAction(() => onConfirm); setShowDiscardDraftModal(true);
  }

  const closeDiscardDraftModal = useCallback(() => { setShowDiscardDraftModal(false); setPendingDiscardDraftAction(null); }, []);

  const confirmDiscardDraft = useCallback(() => {
    const onConfirm = pendingDiscardDraftAction;
    setShowDiscardDraftModal(false); setPendingDiscardDraftAction(null);
    if (typeof onConfirm === "function") onConfirm();
  }, [pendingDiscardDraftAction]);

  const updateTableRow = useCallback((nextRow, { prepend = false } = {}) => {
    const nextId = rowIdOf(nextRow);
    if (!nextId) return;
    setTableRows((prev) => {
      const idx = prev.findIndex((r) => rowIdOf(r) === nextId);
      if (idx < 0) return prepend ? [nextRow, ...prev] : [...prev, nextRow];
      const copy = [...prev]; copy[idx] = nextRow; return copy;
    });
  }, [setTableRows]);

  const openExistingUserPanel = useCallback((row, mode) => {
    const userId = rowIdOf(row);
    if (!userId) { toastError("Invalid user row selected.", "User Master Setup"); return; }
    if (isTemporaryId(userId)) { toastWarning("Save Batch first before opening staged users.", "User Master Setup"); return; }

    requestDiscardDraftConfirmation(() => {
      const loadPanel = async () => {
        setPanelOpen(true); setPanelMode(mode); setPanelUserId(userId); setActiveTab("profile"); setIsPanelLoading(true);
        try {
          const { user, accessRows: loadedAccess } = await fetchUserDetail(userId);
          const fallbackStatusId = lookups?.statuses?.[0]?.status_id ?? null;
          const nextForm = createFormFromUser(user, fallbackStatusId, lookups?.statuses || []);
          setForm(nextForm); setBaselineForm(cloneForm(nextForm));
          setAccessRows(cloneAccessRows(loadedAccess)); setBaselineAccessRows(cloneAccessRows(loadedAccess));
          setEnableNewPassword(false); setNewPasswordValue(""); setConfirmNewPassword("");
          setAccessEditor(EMPTY_ACCESS_EDITOR);
          setBaselineSnapshot(buildPanelSnapshot(nextForm, loadedAccess, false, "", ""));
        } catch (error) {
          toastError(error?.message || "Failed to load selected user.", "User Master Setup"); resetPanelState();
        } finally { setIsPanelLoading(false); }
      };
      void loadPanel();
    });
  }, [lookups?.statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAddUserPanel = useCallback(() => {
    requestDiscardDraftConfirmation(() => {
      const fallbackStatusId = lookups?.statuses?.[0]?.status_id ?? null;
      const nextForm = createEmptyForm(fallbackStatusId, lookups?.statuses || []);
      setPanelOpen(true); setPanelMode("add"); setPanelUserId(null); setActiveTab("profile"); setIsPanelLoading(false);
      setForm(nextForm); setBaselineForm(cloneForm(nextForm)); setAccessRows([]); setBaselineAccessRows([]);
      setEnableNewPassword(true); setNewPasswordValue(""); setConfirmNewPassword("");
      setAccessEditor(EMPTY_ACCESS_EDITOR);
      setBaselineSnapshot(buildPanelSnapshot(nextForm, [], true, "", ""));
    });
  }, [lookups?.statuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const closePanel = useCallback(() => { requestDiscardDraftConfirmation(() => resetPanelState()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback((nextStatusId) => {
    setForm((p) => ({ ...p, status_id: normalizeOptionalText(nextStatusId), is_active: inferActiveFromStatus(nextStatusId, lookups?.statuses || [], p?.is_active) }));
  }, [lookups?.statuses]);

  const handleCompanyChange = useCallback((nextCompId) => {
    setForm((p) => {
      const nid = normalizeOptionalText(nextCompId);
      const valid = (lookups?.departments || []).some((r) => String(r?.dept_id) === String(p?.dept_id) && String(r?.comp_id) === String(nid));
      return { ...p, comp_id: nid, dept_id: valid ? p?.dept_id : null };
    });
  }, [lookups?.departments]);

  const startAccessCreate = useCallback(() => {
    if (!panelEditable) return;
    if (panelMode === "add") { toastInfo("Save this new user in batch first, then assign access.", "User Master Setup"); return; }
    setAccessEditor({ mode: "add", access_key: null, original_app_id: "", original_role_id: "", app_id: "", role_id: "" });
  }, [panelEditable, panelMode]);

  const cancelAccessEditor = useCallback(() => setAccessEditor(EMPTY_ACCESS_EDITOR), []);

  const submitAccessEditor = useCallback(() => {
    const appId = normalizeText(accessEditor?.app_id), roleId = normalizeText(accessEditor?.role_id);
    if (!appId || !roleId) { toastError("Application and role are required.", "User Master Setup"); return; }
    const dup = accessRows.some((r) => {
      const same = String(r?.app_id) === appId && String(r?.role_id) === roleId;
      if (!same) return false;
      return accessEditor?.mode !== "edit" || String(r?.access_key) !== String(accessEditor?.access_key);
    });
    if (dup) { toastError("That application/role mapping already exists.", "User Master Setup"); return; }
    if (accessEditor?.mode === "edit") {
      setAccessRows((prev) => prev.map((r) => String(r?.access_key) !== String(accessEditor?.access_key) ? r : makeLocalAccessRow(appId, roleId, lookups, r)));
    } else {
      setAccessRows((prev) => [...prev, makeLocalAccessRow(appId, roleId, lookups)]);
    }
    setAccessEditor(EMPTY_ACCESS_EDITOR);
  }, [accessEditor, accessRows, lookups]);

  const closeAccessDeactivateModal = useCallback(() => setPendingAccessDeactivateRow(null), []);
  const confirmRemoveAccessRow = useCallback(() => {
    const row = pendingAccessDeactivateRow; setPendingAccessDeactivateRow(null);
    if (!row) return;
    setAccessRows((prev) => prev.filter((e) => String(e?.access_key) !== String(row?.access_key)));
  }, [pendingAccessDeactivateRow]);

  const [isStaging, setIsStaging] = useState(false);

  const stagePanelChanges = useCallback(async () => {
    if (!panelEditable) return;
    setIsStaging(true);
    try {
      const username = normalizeText(form?.username), email = normalizeText(form?.email).toLowerCase();
      if (!username) throw new Error("Username is required.");
      if (!email) throw new Error("Email is required.");
      if (enableNewPassword) {
        const pw = normalizeText(newPasswordValue), cpw = normalizeText(confirmNewPassword);
        if (!pw) throw new Error("Password is required when Set New Password is enabled.");
        if (pw.length < 8) throw new Error("Password must be at least 8 characters.");
        if (pw !== cpw) throw new Error("Confirm password must match.");
      }
      const stagedPw = enableNewPassword ? normalizeText(newPasswordValue) : "";
      const payload = buildUserPayload(form, stagedPw);

      let batch;
      if (panelMode === "add") {
        const tempId = `tmp-${Date.now().toString(36)}`;
        batch = { ...createEmptyPendingBatch(), creates: [{ tempId, payload, accessRows: cloneAccessRows(accessRows) }] };
      } else {
        const userId = normalizeText(panelUserId);
        if (!userId || isTemporaryId(userId)) throw new Error("Invalid user selected for update.");
        const { deletes, upserts } = diffAccessRows(baselineAccessRows, accessRows);
        batch = {
          ...createEmptyPendingBatch(),
          updates: { [userId]: payload },
          accessUpserts: upserts.length > 0 ? { [userId]: upserts } : {},
          accessDeletes: deletes.length > 0 ? { [userId]: deletes } : {},
        };
      }

      await executeBatchSave(batch);
      await refreshUsers({ silent: true });
      resetPanelState();
      toastSuccess(panelMode === "add" ? "User created successfully." : "User updated successfully.", "User Master Setup");
    } catch (error) {
      toastError(error?.message || "Failed to save changes.", "User Master Setup");
    } finally { setIsStaging(false); }
  }, [accessRows, baselineAccessRows, confirmNewPassword, enableNewPassword, form,
    newPasswordValue, panelEditable, panelMode, panelUserId, refreshUsers, resetPanelState]);

  const restorePanelToBaseline = useCallback(() => {
    if (panelMode === "add") { resetPanelState(); return; }
    setForm(cloneForm(baselineForm)); setAccessRows(cloneAccessRows(baselineAccessRows));
    setEnableNewPassword(false); setNewPasswordValue(""); setConfirmNewPassword("");
    setAccessEditor(EMPTY_ACCESS_EDITOR);
    setBaselineSnapshot(buildPanelSnapshot(baselineForm, baselineAccessRows, false, "", ""));
    setPanelMode("view");
  }, [baselineAccessRows, baselineForm, panelMode, resetPanelState]);

  return {
    panelOpen, panelMode, panelUserId, activeTab, isPanelLoading, panelDirty, panelEditable,
    canDeactivateCurrentUser, isStaging,
    form, setForm, accessRows, setAccessRows, accessEditor, setAccessEditor,
    enableNewPassword, setEnableNewPassword, newPasswordValue, setNewPasswordValue,
    confirmNewPassword, setConfirmNewPassword,
    showDiscardDraftModal, pendingAccessDeactivateRow,
    setActiveTab, setPanelMode,
    openExistingUserPanel, openAddUserPanel, closePanel, resetPanelState,
    handleStatusChange, handleCompanyChange,
    startAccessCreate, cancelAccessEditor, submitAccessEditor,
    closeAccessDeactivateModal, confirmRemoveAccessRow, setPendingAccessDeactivateRow,
    closeDiscardDraftModal, confirmDiscardDraft,
    stagePanelChanges, restorePanelToBaseline,
  };
}

function useUserMasterSetup({ users = [], totalUsers = 0 }) {
  const [tableRows, setTableRows] = useState(Array.isArray(users) ? users : []);
  const [lookups, setLookups] = useState(EMPTY_LOOKUPS);
  const [pendingBatch, setPendingBatch] = useState(createEmptyPendingBatch);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [isDeactivatingUser, setIsDeactivatingUser] = useState(false);
  const [showCancelBatchModal, setShowCancelBatchModal] = useState(false);
  const [showDeactivateUserModal, setShowDeactivateUserModal] = useState(false);

  const pendingCount = useMemo(() => pendingBatchCount(pendingBatch), [pendingBatch]);
  const hasPendingChanges = pendingCount > 0;
  const totalRowCount = useMemo(() => tableRows.length || (Number.isFinite(Number(totalUsers)) ? Number(totalUsers) : 0), [tableRows.length, totalUsers]);

  const refreshUsers = useCallback(async ({ silent = false } = {}) => {
    setIsRefreshing(true);
    try {
      const next = await fetchUsers();
      setTableRows(next.map((r) => ({ ...r, __batchState: "none" })));
      if (!silent) toastSuccess("User list refreshed.", "User Master Setup");
    } catch (error) { toastError(error?.message || "Failed to load users.", "User Master Setup"); }
    finally { setIsRefreshing(false); }
  }, []);

  const panel = useUserPanel({ lookups, tableRows, selectedUserRow: null, pendingBatch, setTableRows, setPendingBatch, refreshUsers });

  const selectedUserRow = useMemo(
    () => tableRows.find((r) => rowIdOf(r) === String(panel.panelUserId ?? "")) || null,
    [panel.panelUserId, tableRows]);

  const selectedStatusLabel = useMemo(() => {
    const label = findLabel(lookups?.statuses, "status_id", panel.form?.status_id);
    if (label && label !== "--") return label.toUpperCase();
    return panel.form?.is_active ? "ACTIVE" : "INACTIVE";
  }, [panel.form?.is_active, panel.form?.status_id, lookups?.statuses]);

  const departmentsForCompany = useMemo(() => {
    if (!normalizeText(panel.form?.comp_id)) return lookups?.departments || [];
    return (lookups?.departments || []).filter((r) => String(r?.comp_id) === String(panel.form?.comp_id));
  }, [panel.form?.comp_id, lookups?.departments]);

  const roleOptionsForAccessEditor = useMemo(() => {
    if (!normalizeText(panel.accessEditor?.app_id)) return [];
    return (lookups?.roles || []).filter((r) => String(r?.app_id) === String(panel.accessEditor.app_id));
  }, [panel.accessEditor?.app_id, lookups?.roles]);

  const loadLookups = useCallback(async () => {
    setIsLoadingLookups(true);
    try { setLookups(await fetchLookups()); }
    catch (error) { toastError(error?.message || "Failed to load lookups.", "User Master Setup"); }
    finally { setIsLoadingLookups(false); }
  }, []);

  useEffect(() => { loadLookups(); }, [loadLookups]);

  const saveBatch = useCallback(async () => {
    if (!hasPendingChanges) { toastInfo("There are no staged changes.", "User Master Setup"); return; }
    if (panel.panelDirty) { toastError("Stage or discard panel changes before saving the batch.", "User Master Setup"); return; }
    setIsSavingBatch(true);
    try {
      await executeBatchSave(pendingBatch);
      setPendingBatch(createEmptyPendingBatch());
      await refreshUsers({ silent: true });
      if (isTemporaryId(panel.panelUserId)) panel.resetPanelState();
      toastSuccess("Batch saved successfully.", "User Master Setup");
    } catch (error) { toastError(error?.message || "Failed to save staged batch.", "User Master Setup"); }
    finally { setIsSavingBatch(false); }
  }, [hasPendingChanges, panel, pendingBatch, refreshUsers]);

  const cancelBatch = useCallback(() => {
    if (!hasPendingChanges) { toastInfo("There are no staged changes to cancel.", "User Master Setup"); return; }
    setShowCancelBatchModal(true);
  }, [hasPendingChanges]);

  const confirmCancelBatch = useCallback(async () => {
    setShowCancelBatchModal(false);
    setPendingBatch(createEmptyPendingBatch());
    await refreshUsers({ silent: true });
    if (isTemporaryId(panel.panelUserId)) panel.resetPanelState();
    toastSuccess("Staged batch changes canceled.", "User Master Setup");
  }, [panel, refreshUsers]);

  const deactivateCurrentUser = useCallback(() => {
    const userId = normalizeText(panel.panelUserId);
    if (!userId || isTemporaryId(userId)) { toastError("Invalid user selected for deactivation.", "User Master Setup"); return; }
    setShowDeactivateUserModal(true);
  }, [panel]);

  const confirmDeactivateCurrentUser = useCallback(async () => {
    setShowDeactivateUserModal(false);
    const userId = normalizeText(panel.panelUserId);
    if (!userId || isTemporaryId(userId)) { toastError("Invalid user selected for deactivation.", "User Master Setup"); return; }
    setIsDeactivatingUser(true);
    try {
      const revokedCount = await executeDeactivateUser(userId);
      setPendingBatch((p) => ({
        ...p, updates: removeObjectKey(p?.updates, userId),
        accessUpserts: removeObjectKey(p?.accessUpserts, userId),
        accessDeletes: removeObjectKey(p?.accessDeletes, userId),
      }));
      await refreshUsers({ silent: true }); panel.resetPanelState();
      toastSuccess(`User deactivated successfully. Revoked ${revokedCount} access mapping(s).`, "User Master Setup");
    } catch (error) { toastError(error?.message || "Failed to deactivate user.", "User Master Setup"); }
    finally { setIsDeactivatingUser(false); }
  }, [panel, refreshUsers]);

  return {
    tableRows, lookups, isRefreshing, isLoadingLookups, isSavingBatch, isDeactivatingUser,
    pendingCount, hasPendingChanges, totalRowCount,
    selectedUserRow, selectedStatusLabel, departmentsForCompany, roleOptionsForAccessEditor,
    showCancelBatchModal, setShowCancelBatchModal, showDeactivateUserModal, setShowDeactivateUserModal,
    saveBatch, cancelBatch, confirmCancelBatch, refreshUsers,
    deactivateCurrentUser, confirmDeactivateCurrentUser,
    ...panel,
  };
}

// ═══════════════════════════════════════════════════════════
//  LOCAL COMPONENTS
// ═══════════════════════════════════════════════════════════

function UserMasterHeader({
  totalRowCount,
  isSavingBatch, isRefreshing,
  openAddUserPanel, refreshUsers,
}) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
      <div>
        <h1 className="h4 mb-1">User Master Setup</h1>
        <p className="text-muted mb-0">{totalRowCount} user row(s)</p>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button type="button" variant="success" size="sm" onClick={openAddUserPanel} disabled={isSavingBatch || isRefreshing}>
          Add User
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => refreshUsers()} disabled={isSavingBatch || isRefreshing}>
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>
    </div>
  );
}

function UserTableSection({ tableRows, panelUserId, panelOpen, onRowClick }) {
  const columns = useMemo(() => [
    { key: "employee_id", label: "Employee ID", width: 150, sortable: true },
    { key: "username", label: "Username", width: 170, sortable: true },
    { key: "full_name", label: "Full Name", width: 210, sortable: true },
    { key: "email", label: "Email", width: 280, sortable: true },
    { key: "company_name", label: "Company", width: 210, sortable: true },
    { key: "department_name", label: "Department", width: 200, sortable: true },
    {
      key: "status_label", label: "Status", width: 130, sortable: true, align: "center",
      render: (row) => (
        <StatusBadge status={row?.is_active ? "active" : "inactive"} label={normalizeText(row?.status_label).toUpperCase() || undefined} />
      ),
    },
  ], []);

  return (
    <Card>
      <TableZ columns={columns} data={tableRows} rowIdKey="id"
        selectedRowId={panelUserId} onRowClick={onRowClick}
        showActionColumn={false} emptyMessage="No users found." />
    </Card>
  );
}

function UserPanelSection({
  panelOpen, panelMode, isPanelLoading, panelDirty, panelEditable,
  canDeactivateCurrentUser, isStaging, isLoadingLookups, isSavingBatch,
  activeTab, form, setForm, accessRows, setAccessRows, accessEditor, setAccessEditor,
  enableNewPassword, setEnableNewPassword, newPasswordValue, setNewPasswordValue,
  confirmNewPassword, setConfirmNewPassword,
  selectedStatusLabel, departmentsForCompany, roleOptionsForAccessEditor, lookups,
  setPendingAccessDeactivateRow,
  setActiveTab, setPanelMode, closePanel,
  handleStatusChange, handleCompanyChange,
  startAccessCreate, cancelAccessEditor, submitAccessEditor,
  stagePanelChanges, restorePanelToBaseline, deactivateCurrentUser,
}) {
  const activeTabMeta = TABS.find((t) => t.key === activeTab) || TABS[0];

  const accessColumns = useMemo(() => [
    { key: "application_name", label: "Application" },
    { key: "role_name", label: "Role" },
    { key: "is_active", label: "Status", width: 100, align: "center",
      render: (r) => <StatusBadge status={r?.is_active ? "active" : "inactive"} /> },
  ], []);

  const accessTableActions = useMemo(() => [
    { key: "edit-access", label: "Edit", type: "secondary", icon: "pen",
      visible: (r) => panelEditable && r?.is_active,
      onClick: (r) => { if (!panelEditable) return; setAccessEditor({ mode: "edit", access_key: r?.access_key, original_app_id: normalizeText(r?.app_id), original_role_id: normalizeText(r?.role_id), app_id: normalizeText(r?.app_id), role_id: normalizeText(r?.role_id) }); } },
    { key: "deactivate-access", label: "Deactivate", type: "warning", icon: "ban",
      visible: (r) => panelEditable && r?.is_active,
      onClick: (r) => { if (!panelEditable || !r) return; setAccessRows((prev) => prev.map((row) => String(row?.access_key) === String(r?.access_key) ? { ...row, is_active: false } : row)); } },
    { key: "activate-access", label: "Activate", type: "success", icon: "check",
      visible: (r) => panelEditable && !r?.is_active,
      onClick: (r) => { if (!panelEditable || !r) return; setAccessRows((prev) => prev.map((row) => String(row?.access_key) === String(r?.access_key) ? { ...row, is_active: true } : row)); } },
    { key: "delete-access", label: "Delete", type: "danger", icon: "trash",
      visible: () => panelEditable,
      onClick: (r) => { if (!panelEditable || !r) return; setAccessRows((prev) => prev.filter((row) => String(row?.access_key) !== String(r?.access_key))); } },
  ], [panelEditable, setAccessEditor, setAccessRows]);

  const accessEditorReady = Boolean(normalizeText(accessEditor?.app_id) && normalizeText(accessEditor?.role_id));

  return (
    <aside className={`umsp-sidepanel ${panelOpen ? "is-open" : ""}`} aria-hidden={!panelOpen}>
      <div className="umsp-sidepanel-header">
        <div>
          <h2 className="h6 mb-1">{panelMode === "add" ? "Add User" : panelMode === "edit" ? "Edit User" : "User Details"}</h2>
          <div className="d-flex align-items-center gap-1 flex-wrap umsp-status-row">
            <StatusBadge status={form?.is_active ? "active" : "inactive"} label={selectedStatusLabel} />
            <Badge bg={panelMode === "view" ? "info" : "warning"} text="dark">{panelMode.toUpperCase()}</Badge>
            {panelDirty ? <span className="small text-danger fw-semibold">Unsaved changes</span> : <span className="small text-muted">All changes staged</span>}
          </div>
          {panelMode !== "add" && <p className="small text-muted mb-0 mt-1">{[form?.first_name, form?.middle_name, form?.last_name].filter(Boolean).join(" ") || form?.username || ""}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" className="umsp-close-btn" onClick={closePanel}><FontAwesomeIcon icon={faXmark} aria-hidden="true" /></Button>
      </div>

      {isPanelLoading ? (
        <div className="umsp-sidepanel-loading">Loading user details...</div>
      ) : (
        <>
          <div className="umsp-tabs">
            {TABS.map((t) => (
              <Button key={t.key} type="button" variant="ghost" className={`umsp-tab-btn ${activeTab === t.key ? "is-active" : ""}`} onClick={() => setActiveTab(t.key)}>{t.label}</Button>
            ))}
          </div>
          <div className="umsp-tab-description"><p className="mb-0">{activeTabMeta?.description}</p></div>

          <div className="umsp-tab-content">
            {activeTab === "profile" ? (
              <div className="row g-2">
                <div className="col-12"><label className="form-label mb-1">Employee ID</label>
                  <Input value={form.employee_id} readOnly disabled placeholder={panelMode === "add" ? "Auto-generated on save" : "--"} /></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Username</label>
                  <Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Enter username" /></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Email</label>
                  <Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Enter email" /></div>
                <div className="col-12 col-md-4"><label className="form-label mb-1">First Name</label>
                  <Input value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="First name" /></div>
                <div className="col-12 col-md-4"><label className="form-label mb-1">Middle Name</label>
                  <Input value={form.middle_name} onChange={(e) => setForm((p) => ({ ...p, middle_name: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Middle name" /></div>
                <div className="col-12 col-md-4"><label className="form-label mb-1">Last Name</label>
                  <Input value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Last name" /></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Phone</label>
                  <Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Phone" /></div>
                <div className="col-12"><label className="form-label mb-1">Address</label>
                  <Input as="textarea" rows={2} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Address" /></div>
              </div>
            ) : null}

            {activeTab === "organization" ? (
              <div className="row g-2">
                <div className="col-12 col-md-6"><label className="form-label mb-1">Company</label>
                  <Input as="select" value={asChoiceValue(form.comp_id)} onChange={(e) => handleCompanyChange(e.target.value)} disabled={!panelEditable || isPanelLoading}>
                    <option value="">Select company</option>
                    {(lookups?.companies || []).map((c) => <option key={String(c?.comp_id)} value={String(c?.comp_id)}>{c?.label}</option>)}
                  </Input></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Department</label>
                  <Input as="select" value={asChoiceValue(form.dept_id)} onChange={(e) => setForm((p) => ({ ...p, dept_id: normalizeOptionalText(e.target.value) }))} disabled={!panelEditable || isPanelLoading}>
                    <option value="">Select department</option>
                    {departmentsForCompany.map((d) => <option key={String(d?.dept_id)} value={String(d?.dept_id)}>{d?.label}</option>)}
                  </Input></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Position</label>
                  <Input value={form.position} onChange={(e) => setForm((p) => ({ ...p, position: e.target.value }))} disabled={!panelEditable || isPanelLoading} placeholder="Position" /></div>
                <div className="col-12 col-md-6"><label className="form-label mb-1">Hire Date</label>
                  <Input type="date" value={form.hire_date} onChange={(e) => setForm((p) => ({ ...p, hire_date: e.target.value }))} disabled={!panelEditable || isPanelLoading} /></div>
                <div className="col-12"><label className="form-label mb-1">Status</label>
                  <Input as="select" value={asChoiceValue(form.status_id)} onChange={(e) => handleStatusChange(e.target.value)} disabled={!panelEditable || isPanelLoading}>
                    <option value="">Select status</option>
                    {(lookups?.statuses || []).map((s) => <option key={String(s?.status_id)} value={String(s?.status_id)}>{s?.label}</option>)}
                  </Input></div>
              </div>
            ) : null}

            {activeTab === "access" ? (
              <>
                <div className="d-flex justify-content-between align-items-center mb-2 umsp-access-toolbar">
                  <div className="small text-muted umsp-access-helper-text">Assign application role access using shared setup table controls.</div>
                  <Button type="button" variant="success" size="sm" className="umsp-access-trigger-btn" onClick={startAccessCreate} disabled={!panelEditable}>Add Access</Button>
                </div>
                {accessEditor?.mode ? (
                  <div className="umsp-access-editor mb-2">
                    <div className="umsp-access-editor-head">
                      <h3 className="umsp-access-editor-title mb-0">{accessEditor?.mode === "edit" ? "Edit Access Mapping" : "Add Access Mapping"}</h3>
                      <p className="umsp-access-editor-subtitle mb-0">Choose one application and the role to assign.</p>
                    </div>
                    <div className="row g-2 umsp-access-editor-grid">
                      <div className="col-12 col-md-6"><label className="form-label mb-1">Application</label>
                        <Input as="select" value={asChoiceValue(accessEditor?.app_id)} onChange={(e) => setAccessEditor((p) => ({ ...p, app_id: e.target.value, role_id: "" }))}>
                          <option value="">Select application</option>
                          {(lookups?.applications || []).map((a) => <option key={String(a?.app_id)} value={String(a?.app_id)}>{a?.label}</option>)}
                        </Input></div>
                      <div className="col-12 col-md-6"><label className="form-label mb-1">Role</label>
                        <Input as="select" value={asChoiceValue(accessEditor?.role_id)} onChange={(e) => setAccessEditor((p) => ({ ...p, role_id: e.target.value }))} disabled={!normalizeText(accessEditor?.app_id)}>
                          <option value="">{normalizeText(accessEditor?.app_id) ? "Select role" : "Select application first"}</option>
                          {roleOptionsForAccessEditor.map((r) => <option key={String(r?.role_id)} value={String(r?.role_id)}>{r?.label}</option>)}
                        </Input></div>
                    </div>
                    <div className="umsp-access-editor-actions">
                      <Button type="button" variant="primary" size="sm" onClick={submitAccessEditor} disabled={!accessEditorReady}><FontAwesomeIcon icon={faCheck} className="me-1" aria-hidden="true" />Save</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={cancelAccessEditor}>Cancel</Button>
                    </div>
                  </div>
                ) : null}
                <TableZ className="umsp-access-table" columns={accessColumns} data={accessRows} rowIdKey="access_key" selectedRowId={null} emptyMessage="No access mappings assigned." actions={accessTableActions} hideSearch hideFooter />
              </>
            ) : null}

            {activeTab === "account" ? (
              <div className="row g-2">
                <div className="col-12"><label className="form-label mb-1">Last Login</label><Input value={formatDateTime(form?.last_login_at)} readOnly disabled /></div>
                <div className="col-12">
                  <div className="form-check mt-1">
                    <input id="umsp-set-password" className="form-check-input" type="checkbox" checked={enableNewPassword}
                      onChange={(e) => { setEnableNewPassword(e.target.checked); if (!e.target.checked) { setNewPasswordValue(""); setConfirmNewPassword(""); } }} disabled={!panelEditable || isPanelLoading} />
                    <label htmlFor="umsp-set-password" className="form-check-label">Set New Password</label>
                  </div>
                </div>
                {enableNewPassword ? (
                  <>
                    <div className="col-12 col-md-6"><label className="form-label mb-1">New Password</label>
                      <Input type="password" value={newPasswordValue} onChange={(e) => setNewPasswordValue(e.target.value)} disabled={!panelEditable || isPanelLoading} placeholder="At least 8 characters" /></div>
                    <div className="col-12 col-md-6"><label className="form-label mb-1">Confirm Password</label>
                      <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} disabled={!panelEditable || isPanelLoading} placeholder="Re-enter password" /></div>
                  </>
                ) : null}
                {panelEditable && canDeactivateCurrentUser ? (
                  <div className="col-12 mt-3 pt-3 border-top">
                    <label className="form-label mb-1">User Status</label>
                    <div>
                      {form?.is_active ? (
                        <Button type="button" variant="danger" size="sm" onClick={deactivateCurrentUser} disabled={isStaging || isSavingBatch}>
                          Deactivate User
                        </Button>
                      ) : (
                        <Button type="button" variant="success" size="sm" onClick={() => { setForm((f) => ({ ...f, is_active: true, status_id: "1" })); }} disabled={isStaging || isSavingBatch}>
                          Activate User
                        </Button>
                      )}
                      <p className="small text-muted mt-1 mb-0">{form?.is_active ? "Deactivating will revoke all access mappings." : "Reactivate this user account."}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="umsp-sidepanel-footer">
            {panelMode === "view" ? (
              <>
                <Button type="button" variant="primary" size="sm" onClick={() => setPanelMode("edit")} disabled={isLoadingLookups}>Edit</Button>
                <Button type="button" variant="ghost" size="sm" onClick={closePanel}>Close</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="primary" size="sm" onClick={stagePanelChanges} disabled={isStaging || isSavingBatch || isLoadingLookups}>
                  {isStaging ? "Saving..." : "Save"}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={restorePanelToBaseline} disabled={isStaging || isSavingBatch}>
                  Cancel</Button>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function UserModalsSection({
  showDiscardDraftModal, showCancelBatchModal, showDeactivateUserModal,
  pendingAccessDeactivateRow,
  isDeactivatingUser, isSavingBatch, isRefreshing,
  closeDiscardDraftModal, confirmDiscardDraft,
  closeAccessDeactivateModal, confirmRemoveAccessRow,
  setShowCancelBatchModal, confirmCancelBatch,
  setShowDeactivateUserModal, confirmDeactivateCurrentUser,
}) {
  return (
    <>
      <Modal show={showDiscardDraftModal} onHide={closeDiscardDraftModal} title="Discard Unsaved Changes"
        footer={<><Button type="button" variant="ghost" onClick={closeDiscardDraftModal}>Keep Editing</Button>
          <Button type="button" variant="danger" onClick={confirmDiscardDraft}>Discard Changes</Button></>}>
        <p className="mb-0">You have unsaved panel changes. Discard them?</p>
      </Modal>

      <Modal show={Boolean(pendingAccessDeactivateRow)} onHide={closeAccessDeactivateModal} title="Deactivate Access"
        footer={<><Button type="button" variant="ghost" onClick={closeAccessDeactivateModal}>Keep Access</Button>
          <Button type="button" variant="warning" onClick={confirmRemoveAccessRow}>Deactivate Access</Button></>}>
        <p className="mb-0">Deactivate access {pendingAccessDeactivateRow?.application_name || "Application"}{" / "}{pendingAccessDeactivateRow?.role_name || "Role"}?</p>
      </Modal>

      <Modal show={showDeactivateUserModal} onHide={() => setShowDeactivateUserModal(false)} title="Deactivate User"
        footer={<><Button type="button" variant="ghost" onClick={() => setShowDeactivateUserModal(false)} disabled={isDeactivatingUser || isSavingBatch || isRefreshing}>Keep User Active</Button>
          <Button type="button" variant="warning" onClick={confirmDeactivateCurrentUser} disabled={isDeactivatingUser || isSavingBatch || isRefreshing}>{isDeactivatingUser ? "Deactivating..." : "Deactivate User"}</Button></>}>
        <p className="mb-0">Deactivate this user? This is a soft delete and will revoke all system access.</p>
      </Modal>

      <Modal show={showCancelBatchModal} onHide={() => setShowCancelBatchModal(false)} title="Cancel Batch"
        footer={<><Button type="button" variant="ghost" onClick={() => setShowCancelBatchModal(false)} disabled={isSavingBatch || isRefreshing}>Keep Staged Changes</Button>
          <Button type="button" variant="danger" onClick={confirmCancelBatch} disabled={isSavingBatch || isRefreshing}>Cancel Batch</Button></>}>
        <p className="mb-0">Cancel all staged batch changes?</p>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
//  MAIN VIEW
// ═══════════════════════════════════════════════════════════

export default function UserMasterSetupView({ users, totalUsers }) {
  const h = useUserMasterSetup({ users, totalUsers });

  return (
    <main className="container-fluid py-3 umsp-shell">
      <section className={`umsp-users-pane ${h.panelOpen ? "is-panel-open" : ""}`}>
        <UserMasterHeader
          totalRowCount={h.totalRowCount} hasPendingChanges={h.hasPendingChanges} pendingCount={h.pendingCount}
          isSavingBatch={h.isSavingBatch} isRefreshing={h.isRefreshing}
          openAddUserPanel={h.openAddUserPanel} refreshUsers={h.refreshUsers}
        />
        <UserTableSection tableRows={h.tableRows} panelUserId={h.panelUserId} panelOpen={h.panelOpen}
          onRowClick={(row) => h.openExistingUserPanel(row, "view")} />
      </section>

      <UserPanelSection
        panelOpen={h.panelOpen} panelMode={h.panelMode} isPanelLoading={h.isPanelLoading}
        panelDirty={h.panelDirty} panelEditable={h.panelEditable}
        canDeactivateCurrentUser={h.canDeactivateCurrentUser} isStaging={h.isStaging}
        isLoadingLookups={h.isLoadingLookups} isSavingBatch={h.isSavingBatch}
        activeTab={h.activeTab} form={h.form} setForm={h.setForm}
        accessRows={h.accessRows} setAccessRows={h.setAccessRows} accessEditor={h.accessEditor} setAccessEditor={h.setAccessEditor}
        enableNewPassword={h.enableNewPassword} setEnableNewPassword={h.setEnableNewPassword}
        newPasswordValue={h.newPasswordValue} setNewPasswordValue={h.setNewPasswordValue}
        confirmNewPassword={h.confirmNewPassword} setConfirmNewPassword={h.setConfirmNewPassword}
        selectedStatusLabel={h.selectedStatusLabel} departmentsForCompany={h.departmentsForCompany}
        roleOptionsForAccessEditor={h.roleOptionsForAccessEditor} lookups={h.lookups}
        setPendingAccessDeactivateRow={h.setPendingAccessDeactivateRow}
        setActiveTab={h.setActiveTab} setPanelMode={h.setPanelMode} closePanel={h.closePanel}
        handleStatusChange={h.handleStatusChange} handleCompanyChange={h.handleCompanyChange}
        startAccessCreate={h.startAccessCreate} cancelAccessEditor={h.cancelAccessEditor}
        submitAccessEditor={h.submitAccessEditor}
        stagePanelChanges={h.stagePanelChanges} restorePanelToBaseline={h.restorePanelToBaseline}
        deactivateCurrentUser={h.deactivateCurrentUser}
      />

      <UserModalsSection
        showDiscardDraftModal={h.showDiscardDraftModal} showCancelBatchModal={h.showCancelBatchModal}
        showDeactivateUserModal={h.showDeactivateUserModal}
        pendingAccessDeactivateRow={h.pendingAccessDeactivateRow}
        isDeactivatingUser={h.isDeactivatingUser} isSavingBatch={h.isSavingBatch} isRefreshing={h.isRefreshing}
        closeDiscardDraftModal={h.closeDiscardDraftModal} confirmDiscardDraft={h.confirmDiscardDraft}
        closeAccessDeactivateModal={h.closeAccessDeactivateModal} confirmRemoveAccessRow={h.confirmRemoveAccessRow}
        setShowCancelBatchModal={h.setShowCancelBatchModal} confirmCancelBatch={h.confirmCancelBatch}
        setShowDeactivateUserModal={h.setShowDeactivateUserModal} confirmDeactivateCurrentUser={h.confirmDeactivateCurrentUser}
      />
    </main>
  );
}
