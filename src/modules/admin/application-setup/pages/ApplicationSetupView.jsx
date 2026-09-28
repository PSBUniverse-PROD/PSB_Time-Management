"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  parseAppId, isSameId, compareText, buildOrderSignature,
  mapApplicationRow, mapRoleRow, removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_APP_PREFIX, TEMP_ROLE_PREFIX, createTempId,
  isTempApplicationId, isTempRoleId, createEmptyBatchState, executeBatchSave,
  normalizeModuleKey,
} from "../data/applicationSetup.data.js";

// ─── HOOK: useRoleActions ──────────────────────────────────

function useRoleActions({
  isSavingOrder, isMutatingAction, isSelectedAppPendingDeactivation, selectedApp,
  dialog, roleDraft, pendingDeactivatedRoleIds,
  setAllRoles, setPendingBatch, setDialog, setRoleDraft,
}) {
  const openEditRoleDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    setRoleDraft({ name: String(row?.role_name || ""), desc: String(row?.role_desc || "") });
    setDialog({ kind: "edit-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingOrder, setDialog, setRoleDraft]);

  const openToggleRoleDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    const roleId = String(row?.role_id ?? "");
    if (pendingDeactivatedRoleIds.has(roleId)) {
      setPendingBatch((prev) => ({ ...prev, roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)) }));
      toastSuccess("Role deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-role", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingOrder, pendingDeactivatedRoleIds, setDialog, setPendingBatch]);

  const openDeactivateRoleDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    setDialog({ kind: "deactivate-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingOrder, setDialog]);

  const openAddRoleDialog = useCallback(() => {
    if (isSavingOrder || isMutatingAction) return;
    if (!selectedApp?.app_id) { toastError("Select an application before adding a role."); return; }
    if (isSelectedAppPendingDeactivation) { toastError("Selected application is staged for deactivation. Save or cancel batch before adding a role."); return; }
    setRoleDraft({ name: "", desc: "" });
    setDialog({ kind: "add-role", target: { app_id: selectedApp.app_id, app_name: selectedApp.app_name }, nextIsActive: true });
  }, [isMutatingAction, isSavingOrder, isSelectedAppPendingDeactivation, selectedApp, setDialog, setRoleDraft]);

  const submitEditRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.role_id) { toastError("Invalid role."); return; }
    const roleName = String(roleDraft.name || "").trim();
    if (!roleName) { toastError("Role name is required."); return; }
    const roleDesc = String(roleDraft.desc || "").trim();
    const roleId = row.role_id;
    setAllRoles((prev) => prev.map((r, i) => isSameId(r?.role_id, roleId) ? mapRoleRow({ ...r, role_name: roleName, role_desc: roleDesc }, i) : r));
    setPendingBatch((prev) => {
      if (isTempRoleId(roleId)) {
        return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, role_name: roleName, role_desc: roleDesc } } : e), roleUpdates: removeObjectKey(prev.roleUpdates, roleId) };
      }
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { role_name: roleName, role_desc: roleDesc }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Role update staged for Save Batch.", "Batching");
  }, [dialog, roleDraft, setAllRoles, setDialog, setPendingBatch]);

  const submitToggleRole = useCallback(() => {
    const row = dialog?.target;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.role_id) { toastError("Invalid role."); return; }
    const roleId = row.role_id;
    setAllRoles((prev) => prev.map((r, i) => isSameId(r?.role_id, roleId) ? mapRoleRow({ ...r, is_active: nextIsActive }, i) : r));
    setPendingBatch((prev) => {
      if (isTempRoleId(roleId)) {
        return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e), roleUpdates: removeObjectKey(prev.roleUpdates, roleId) };
      }
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { is_active: nextIsActive }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`Role ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog, setAllRoles, setDialog, setPendingBatch]);

  const submitDeactivateRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.role_id) { toastError("Invalid role."); return; }
    const roleId = row.role_id;
    if (isTempRoleId(roleId)) setAllRoles((items) => items.filter((r) => !isSameId(r?.role_id, roleId)));
    setPendingBatch((prev) => {
      if (isTempRoleId(roleId)) {
        return { ...prev, roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.tempId, roleId)), roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)) };
      }
      return { ...prev, roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleDeactivations: appendUniqueId(prev.roleDeactivations, roleId) };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Role deactivation staged for Save Batch.", "Batching");
  }, [dialog, setAllRoles, setDialog, setPendingBatch]);

  const submitAddRole = useCallback(() => {
    const target = dialog?.target;
    if (!target?.app_id) { toastError("Select an application before adding a role."); return; }
    const roleName = String(roleDraft.name || "").trim();
    if (!roleName) { toastError("Role name is required."); return; }
    const roleDesc = String(roleDraft.desc || "").trim();
    const tempRoleId = createTempId(TEMP_ROLE_PREFIX);
    setAllRoles((prev) => [...prev, mapRoleRow({ role_id: tempRoleId, app_id: target.app_id, role_name: roleName, role_desc: roleDesc, is_active: true }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, roleCreates: [...prev.roleCreates, { tempId: tempRoleId, payload: { app_id: target.app_id, role_name: roleName, role_desc: roleDesc, is_active: true } }] }));
    setDialog(EMPTY_DIALOG);
    setRoleDraft({ name: "", desc: "" });
    toastSuccess("Role staged for Save Batch.", "Batching");
  }, [dialog, roleDraft, setAllRoles, setDialog, setPendingBatch, setRoleDraft]);

  const stageHardDeleteRole = useCallback((row) => {
    const roleId = String(row?.role_id ?? "");
    if (!roleId || isSavingOrder || isMutatingAction) return;
    if (isTempRoleId(roleId)) {
      setAllRoles((prev) => prev.filter((r) => !isSameId(r?.role_id, roleId)));
      setPendingBatch((prev) => ({ ...prev, roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.tempId, roleId)), roleUpdates: removeObjectKey(prev.roleUpdates, roleId) }));
      toastSuccess("Staged role removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({ ...prev, roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)), roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleHardDeletes: appendUniqueId(prev.roleHardDeletes || [], roleId) }));
    toastSuccess("Role deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingOrder, setAllRoles, setPendingBatch]);

  const unstageHardDeleteRole = useCallback((row) => {
    const roleId = String(row?.role_id ?? "");
    if (!roleId || isSavingOrder || isMutatingAction) return;
    setPendingBatch((prev) => ({ ...prev, roleHardDeletes: (prev.roleHardDeletes || []).filter((id) => !isSameId(id, roleId)) }));
    toastSuccess("Role deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingOrder, setPendingBatch]);

  return {
    openEditRoleDialog, openToggleRoleDialog, openDeactivateRoleDialog, openAddRoleDialog,
    submitEditRole, submitToggleRole, submitDeactivateRole, submitAddRole, stageHardDeleteRole, unstageHardDeleteRole,
  };
}

// ─── HOOK: useApplicationSetup ─────────────────────────────

function useApplicationSetup({ applications = [], roles = [], initialSelectedAppId = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seedApplications = useMemo(
    () => (Array.isArray(applications) ? applications : [])
      .map((app, i) => mapApplicationRow(app, i))
      .sort((a, b) => { const d = Number(a.app_order || 0) - Number(b.app_order || 0); return d !== 0 ? d : compareText(a.app_name, b.app_name); }),
    [applications],
  );

  const seedRoles = useMemo(() => (Array.isArray(roles) ? roles : []).map((r, i) => mapRoleRow(r, i)), [roles]);

  const [orderedApplications, setOrderedApplications] = useState(seedApplications);
  const [allRoles, setAllRoles] = useState(seedRoles);
  const [persistedOrderSig, setPersistedOrderSig] = useState(buildOrderSignature(seedApplications));
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(createEmptyBatchState());
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [applicationDraft, setApplicationDraft] = useState({ name: "", desc: "", moduleKey: "" });
  const [roleDraft, setRoleDraft] = useState({ name: "", desc: "" });
  const [editingAppId, setEditingAppId] = useState(null);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [expandedAppId, setExpandedAppId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedApplications(seedApplications); setAllRoles(seedRoles);
    setPersistedOrderSig(buildOrderSignature(seedApplications));
    setIsSavingOrder(false); setIsMutatingAction(false);
    setPendingBatch(createEmptyBatchState()); setDialog(EMPTY_DIALOG);
    setApplicationDraft({ name: "", desc: "", moduleKey: "" }); setRoleDraft({ name: "", desc: "" });
    setEditingAppId(null); setEditingRoleId(null);
  }, [seedApplications, seedRoles]);

  const currentOrderSig = useMemo(() => {
    const excluded = new Set([
      ...(pendingBatch.appCreates || []).map((e) => String(e?.tempId ?? "")),
      ...(pendingBatch.appDeactivations || []).map((id) => String(id ?? "")),
      ...(pendingBatch.appHardDeletes || []).map((id) => String(id ?? "")),
    ]);
    return buildOrderSignature(orderedApplications.filter((r) => !excluded.has(String(r?.app_id ?? ""))));
  }, [orderedApplications, pendingBatch.appCreates, pendingBatch.appDeactivations, pendingBatch.appHardDeletes]);
  const persistedOrderSigFiltered = useMemo(() => {
    const excluded = new Set([
      ...(pendingBatch.appDeactivations || []).map((id) => String(id ?? "")),
      ...(pendingBatch.appHardDeletes || []).map((id) => String(id ?? "")),
    ]);
    const persistedRows = seedApplications.filter((r) => !excluded.has(String(r?.app_id ?? "")));
    return buildOrderSignature(persistedRows);
  }, [seedApplications, pendingBatch.appDeactivations, pendingBatch.appHardDeletes]);
  const hasOrderChanges = persistedOrderSigFiltered !== currentOrderSig;

  const pendingSummary = useMemo(() => {
    const aA = pendingBatch.appCreates.length;
    const aE = Object.entries(pendingBatch.appUpdates || {}).filter(([id, patch]) => {
      const seed = seedApplications.find((a) => isSameId(a?.app_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const aD = pendingBatch.appDeactivations.length, aH = (pendingBatch.appHardDeletes || []).length;
    const rA = pendingBatch.roleCreates.length;
    const rE = Object.entries(pendingBatch.roleUpdates || {}).filter(([id, patch]) => {
      const seed = seedRoles.find((r) => isSameId(r?.role_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const rD = pendingBatch.roleDeactivations.length, rH = (pendingBatch.roleHardDeletes || []).length;
    const oC = hasOrderChanges ? 1 : 0;
    return { applicationAdded: aA, applicationEdited: aE, applicationDeactivated: aD, applicationHardDeleted: aH, roleAdded: rA, roleEdited: rE, roleDeactivated: rD, roleHardDeleted: rH, rowOrderChanged: oC, total: aA + aE + aD + aH + rA + rE + rD + rH + oC };
  }, [hasOrderChanges, pendingBatch, seedApplications, seedRoles]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedAppIds = useMemo(() => new Set((pendingBatch.appDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.appDeactivations]);
  const pendingDeactivatedRoleIds = useMemo(() => new Set((pendingBatch.roleDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.roleDeactivations]);
  const pendingHardDeletedAppIds = useMemo(() => new Set((pendingBatch.appHardDeletes || []).map((id) => String(id ?? ""))), [pendingBatch.appHardDeletes]);
  const pendingHardDeletedRoleIds = useMemo(() => new Set((pendingBatch.roleHardDeletes || []).map((id) => String(id ?? ""))), [pendingBatch.roleHardDeletes]);

  const selectedAppId = useMemo(() => {
    const fromQuery = parseAppId(searchParams?.get("app"));
    if (fromQuery !== null) return fromQuery;
    if (initialSelectedAppId != null && initialSelectedAppId !== "") return initialSelectedAppId;
    return orderedApplications[0]?.app_id ?? null;
  }, [initialSelectedAppId, orderedApplications, searchParams]);

  const selectedApp = useMemo(() => orderedApplications.find((a) => isSameId(a?.app_id, selectedAppId)) ?? orderedApplications[0] ?? null, [orderedApplications, selectedAppId]);
  const isSelectedAppPendingDeactivation = useMemo(() => pendingDeactivatedAppIds.has(String(selectedApp?.app_id ?? "")), [pendingDeactivatedAppIds, selectedApp?.app_id]);
  const selectedAppRoles = useMemo(() => allRoles.filter((r) => isSameId(r?.app_id, selectedApp?.app_id)).sort((a, b) => compareText(a.role_name, b.role_name)), [allRoles, selectedApp?.app_id]);

  const decoratedApplications = useMemo(() => {
    const cIds = new Set((pendingBatch.appCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.appUpdates || {}).filter(([id, patch]) => {
      const seed = seedApplications.find((a) => isSameId(a?.app_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.appDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.appHardDeletes || []).map((e) => String(e ?? "")));
    return orderedApplications.map((row) => {
      const id = String(row?.app_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [orderedApplications, pendingBatch.appCreates, pendingBatch.appDeactivations, pendingBatch.appHardDeletes, pendingBatch.appUpdates, seedApplications]);

  const decoratedSelectedAppRoles = useMemo(() => {
    const cIds = new Set((pendingBatch.roleCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.roleUpdates || {}).filter(([id, patch]) => {
      const seed = seedRoles.find((r) => isSameId(r?.role_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.roleDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.roleHardDeletes || []).map((e) => String(e ?? "")));
    return selectedAppRoles.map((row) => {
      const id = String(row?.role_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [pendingBatch.roleCreates, pendingBatch.roleDeactivations, pendingBatch.roleHardDeletes, pendingBatch.roleUpdates, seedRoles, selectedAppRoles]);

  const updateSelectedApplicationInQuery = useCallback((appId) => {
    const p = new URLSearchParams(searchParams?.toString() || "");
    if (appId == null || appId === "") p.delete("app"); else p.set("app", String(appId));
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleApplicationRowClick = useCallback((row) => {
    const appId = row?.app_id;
    setExpandedAppId((prev) => isSameId(prev, appId) ? null : appId);
    updateSelectedApplicationInQuery(appId);
  }, [updateSelectedApplicationInQuery]);
  const handleApplicationReorder = useCallback((next) => {
    if (isSavingOrder || isMutatingAction) return;
    setOrderedApplications((Array.isArray(next) ? next : []).map((r, i) => ({ ...r, app_order: i + 1, display_order: i + 1 })));
  }, [isMutatingAction, isSavingOrder]);

  const handleCancelOrderChanges = useCallback(() => {
    if (isSavingOrder || isMutatingAction) return;
    batchActiveRef.current = false;
    setOrderedApplications(seedApplications); setAllRoles(seedRoles);
    setPendingBatch(createEmptyBatchState()); setPersistedOrderSig(buildOrderSignature(seedApplications));
    setDialog(EMPTY_DIALOG); setApplicationDraft({ name: "", desc: "", moduleKey: "" }); setRoleDraft({ name: "", desc: "" });
    setEditingAppId(null); setEditingRoleId(null);
    updateSelectedApplicationInQuery(seedApplications[0]?.app_id ?? null);
  }, [isMutatingAction, isSavingOrder, seedApplications, seedRoles, updateSelectedApplicationInQuery]);

  const handleSaveOrderChanges = useCallback(async () => {
    if (!hasPendingChanges || isSavingOrder || isMutatingAction) return;
    setIsSavingOrder(true); setIsMutatingAction(true);
    try {
      const { appIdMap, deactivatedAppSet, orderedPersistedAppIds } = await executeBatchSave(pendingBatch, orderedApplications);
      setPersistedOrderSig(currentOrderSig); setPendingBatch(createEmptyBatchState());
      batchActiveRef.current = false;
      const selKey = String(selectedApp?.app_id ?? "");
      const selResolved = appIdMap.get(selKey) ?? selectedApp?.app_id ?? null;
      const nextSel = selResolved && !deactivatedAppSet.has(String(selResolved)) ? selResolved : (orderedPersistedAppIds[0] ?? null);
      updateSelectedApplicationInQuery(nextSel);
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally { setIsMutatingAction(false); setIsSavingOrder(false); setEditingAppId(null); setEditingRoleId(null); }
  }, [currentOrderSig, hasPendingChanges, isMutatingAction, isSavingOrder, orderedApplications, pendingBatch, pendingSummary.total, router, selectedApp?.app_id, updateSelectedApplicationInQuery]);

  const closeDialog = useCallback(() => { if (!isMutatingAction) setDialog(EMPTY_DIALOG); }, [isMutatingAction]);

  const openEditApplicationDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    setApplicationDraft({ name: String(row?.app_name || ""), desc: String(row?.app_desc || ""), moduleKey: String(row?.module_key || "") });
    setDialog({ kind: "edit-application", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingOrder]);

  const openToggleApplicationDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    const appId = String(row?.app_id ?? "");
    if (pendingDeactivatedAppIds.has(appId)) {
      const linkedRoleIds = allRoles.filter((r) => isSameId(r?.app_id, appId)).map((r) => String(r?.role_id ?? ""));
      setPendingBatch((prev) => ({ ...prev, appDeactivations: (prev.appDeactivations || []).filter((id) => !isSameId(id, appId)), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))) }));
      toastSuccess("Application deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-application", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [allRoles, isMutatingAction, isSavingOrder, pendingDeactivatedAppIds]);

  const openDeactivateApplicationDialog = useCallback((row) => {
    if (isSavingOrder || isMutatingAction) return;
    setDialog({ kind: "deactivate-application", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingOrder]);

  const stageHardDeleteApplication = useCallback((row) => {
    const appId = String(row?.app_id ?? "");
    if (!appId || isSavingOrder || isMutatingAction) return;
    const linkedRoleIds = allRoles.filter((r) => isSameId(r?.app_id, appId)).map((r) => String(r?.role_id ?? ""));
    if (isTempApplicationId(appId)) {
      const nextApps = orderedApplications.filter((a) => !isSameId(a?.app_id, appId)).map((a, i) => ({ ...a, app_order: i + 1, display_order: i + 1 }));
      setOrderedApplications(nextApps);
      setAllRoles((prev) => prev.filter((r) => !isSameId(r?.app_id, appId)));
      setPendingBatch((prev) => ({ ...prev, appCreates: prev.appCreates.filter((e) => !isSameId(e?.tempId, appId)), appUpdates: removeObjectKey(prev.appUpdates, appId), roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.payload?.app_id, appId)), roleUpdates: linkedRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.roleUpdates), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))), roleHardDeletes: (prev.roleHardDeletes || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))) }));
      if (isSameId(selectedApp?.app_id, appId)) updateSelectedApplicationInQuery(nextApps[0]?.app_id ?? null);
      toastSuccess("Staged application removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({ ...prev, appUpdates: removeObjectKey(prev.appUpdates, appId), appDeactivations: (prev.appDeactivations || []).filter((id) => !isSameId(id, appId)), appHardDeletes: appendUniqueId(prev.appHardDeletes || [], appId), roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.payload?.app_id, appId)), roleUpdates: linkedRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.roleUpdates), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))), roleHardDeletes: linkedRoleIds.reduce((ids, id) => isTempRoleId(id) ? ids : appendUniqueId(ids, id), (prev.roleHardDeletes || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id)))) }));
    toastSuccess("Application deletion staged for Save Batch.", "Batching");
  }, [allRoles, isMutatingAction, isSavingOrder, orderedApplications, selectedApp?.app_id, updateSelectedApplicationInQuery]);

  const unstageHardDeleteApplication = useCallback((row) => {
    const appId = String(row?.app_id ?? "");
    if (!appId || isSavingOrder || isMutatingAction) return;
    const linkedRoleIds = allRoles.filter((r) => isSameId(r?.app_id, appId)).map((r) => String(r?.role_id ?? ""));
    setPendingBatch((prev) => ({ ...prev, appHardDeletes: (prev.appHardDeletes || []).filter((id) => !isSameId(id, appId)), roleHardDeletes: (prev.roleHardDeletes || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))) }));
    toastSuccess("Application deletion un-staged.", "Batching");
  }, [allRoles, isMutatingAction, isSavingOrder]);

  const openAddApplicationDialog = useCallback(() => {
    if (isSavingOrder || isMutatingAction) return;
    setApplicationDraft({ name: "", desc: "", moduleKey: "" });
    setDialog({ kind: "add-application", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingOrder]);

  const submitAddApplication = useCallback(() => {
    const appName = String(applicationDraft.name || "").trim();
    if (!appName) { toastError("Application name is required."); return; }
    const appDesc = String(applicationDraft.desc || "").trim();
    const moduleKey = normalizeModuleKey(applicationDraft.moduleKey || "");
    const tempAppId = createTempId(TEMP_APP_PREFIX);
    setOrderedApplications((prev) => [...prev, mapApplicationRow({ app_id: tempAppId, app_name: appName, app_desc: appDesc, module_key: moduleKey || null, is_active: true, app_order: prev.length + 1, display_order: prev.length + 1 }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, appCreates: [...prev.appCreates, { tempId: tempAppId, payload: { app_name: appName, app_desc: appDesc, module_key: moduleKey || null, is_active: true } }] }));
    updateSelectedApplicationInQuery(tempAppId);
    setDialog(EMPTY_DIALOG); setApplicationDraft({ name: "", desc: "", moduleKey: "" });
    toastSuccess("Application staged for Save Batch.", "Batching");
  }, [applicationDraft, updateSelectedApplicationInQuery]);

  const submitEditApplication = useCallback(() => {
    const row = dialog?.target;
    if (!row?.app_id) { toastError("Invalid application."); return; }
    const appName = String(applicationDraft.name || "").trim();
    if (!appName) { toastError("Application name is required."); return; }
    const appDesc = String(applicationDraft.desc || "").trim();
    const moduleKey = normalizeModuleKey(applicationDraft.moduleKey || "");
    const appId = row.app_id;
    setOrderedApplications((prev) => prev.map((a, i) => isSameId(a?.app_id, appId) ? mapApplicationRow({ ...a, app_name: appName, app_desc: appDesc, module_key: moduleKey || null }, i) : a));
    setPendingBatch((prev) => {
      if (isTempApplicationId(appId)) return { ...prev, appCreates: prev.appCreates.map((e) => isSameId(e?.tempId, appId) ? { ...e, payload: { ...e.payload, app_name: appName, app_desc: appDesc, module_key: moduleKey || null } } : e), appUpdates: removeObjectKey(prev.appUpdates, appId) };
      return { ...prev, appUpdates: { ...prev.appUpdates, [String(appId)]: mergeUpdatePatch(prev.appUpdates?.[String(appId)], { app_name: appName, app_desc: appDesc, module_key: moduleKey || null }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Application update staged for Save Batch.", "Batching");
  }, [applicationDraft, dialog]);

  const submitToggleApplication = useCallback(() => {
    const row = dialog?.target;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.app_id) { toastError("Invalid application."); return; }
    const appId = row.app_id;
    setOrderedApplications((prev) => prev.map((a, i) => isSameId(a?.app_id, appId) ? mapApplicationRow({ ...a, is_active: nextIsActive }, i) : a));
    setPendingBatch((prev) => {
      if (isTempApplicationId(appId)) return { ...prev, appCreates: prev.appCreates.map((e) => isSameId(e?.tempId, appId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e), appUpdates: removeObjectKey(prev.appUpdates, appId) };
      return { ...prev, appUpdates: { ...prev.appUpdates, [String(appId)]: mergeUpdatePatch(prev.appUpdates?.[String(appId)], { is_active: nextIsActive }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`Application ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog]);

  const submitDeactivateApplication = useCallback(() => {
    const row = dialog?.target;
    if (!row?.app_id) { toastError("Invalid application."); return; }
    const appId = row.app_id;
    const linkedRoleIds = allRoles.filter((r) => isSameId(r?.app_id, appId)).map((r) => String(r?.role_id ?? ""));
    if (isTempApplicationId(appId)) {
      const nextApps = orderedApplications.filter((a) => !isSameId(a?.app_id, appId)).map((a, i) => ({ ...a, app_order: i + 1, display_order: i + 1 }));
      setOrderedApplications(nextApps); setAllRoles((prev) => prev.filter((r) => !isSameId(r?.app_id, appId)));
      setPendingBatch((prev) => ({ ...prev, appCreates: prev.appCreates.filter((e) => !isSameId(e?.tempId, appId)), appUpdates: removeObjectKey(prev.appUpdates, appId), appDeactivations: (prev.appDeactivations || []).filter((id) => !isSameId(id, appId)), roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.payload?.app_id, appId)), roleUpdates: linkedRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.roleUpdates), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !linkedRoleIds.some((lr) => isSameId(lr, id))) }));
      if (isSameId(selectedApp?.app_id, appId)) updateSelectedApplicationInQuery(nextApps[0]?.app_id ?? null);
      setDialog(EMPTY_DIALOG);
      toastSuccess("Application deactivation staged for Save Batch.", "Batching");
      return;
    }
    setPendingBatch((prev) => {
      const nextRoleDeactivations = linkedRoleIds.reduce((ids, id) => appendUniqueId(ids, id), prev.roleDeactivations || []);
      return { ...prev, appUpdates: removeObjectKey(prev.appUpdates, appId), appDeactivations: appendUniqueId(prev.appDeactivations, appId), roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.payload?.app_id, appId)), roleUpdates: linkedRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.roleUpdates), roleDeactivations: nextRoleDeactivations };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Application deactivation staged for Save Batch.", "Batching");
  }, [allRoles, dialog, orderedApplications, selectedApp?.app_id, updateSelectedApplicationInQuery]);

  const roleActions = useRoleActions({ isSavingOrder, isMutatingAction, isSelectedAppPendingDeactivation, selectedApp, dialog, roleDraft, pendingDeactivatedRoleIds, setAllRoles, setPendingBatch, setDialog, setRoleDraft });

  const startEditingApp = useCallback((row) => { if (isSavingOrder || isMutatingAction) return; const id = String(row?.app_id ?? ""); setEditingAppId((prev) => prev === id ? null : id); }, [isMutatingAction, isSavingOrder]);
  const stopEditingApp = useCallback(() => { setEditingAppId(null); }, []);
  const startEditingRole = useCallback((row) => { if (isSavingOrder || isMutatingAction) return; const id = String(row?.role_id ?? ""); setEditingRoleId((prev) => prev === id ? null : id); }, [isMutatingAction, isSavingOrder]);
  const stopEditingRole = useCallback(() => { setEditingRoleId(null); }, []);

  const handleInlineEditApplication = useCallback((row, key, value) => {
    const appId = row?.app_id;
    if (!appId || isSavingOrder || isMutatingAction) return;
    setOrderedApplications((prev) => prev.map((a, i) => isSameId(a?.app_id, appId) ? mapApplicationRow({ ...a, [key]: value || null }, i) : a));
    setPendingBatch((prev) => {
      if (isTempApplicationId(appId)) return { ...prev, appCreates: prev.appCreates.map((e) => isSameId(e?.tempId, appId) ? { ...e, payload: { ...e.payload, [key]: value || null } } : e) };
      return { ...prev, appUpdates: { ...prev.appUpdates, [String(appId)]: mergeUpdatePatch(prev.appUpdates?.[String(appId)], { [key]: value || null }) } };
    });
  }, [isMutatingAction, isSavingOrder]);

  const handleInlineEditRole = useCallback((row, key, value) => {
    const roleId = row?.role_id;
    if (!roleId || isSavingOrder || isMutatingAction) return;
    setAllRoles((prev) => prev.map((r, i) => isSameId(r?.role_id, roleId) ? mapRoleRow({ ...r, [key]: value || null }, i) : r));
    setPendingBatch((prev) => {
      if (isTempRoleId(roleId)) return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, [key]: value || null } } : e) };
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { [key]: value || null }) } };
    });
  }, [isMutatingAction, isSavingOrder]);

  return {
    decoratedApplications, decoratedSelectedAppRoles, dialog, applicationDraft, roleDraft,
    isSavingOrder, isMutatingAction, pendingSummary, hasPendingChanges,
    pendingDeactivatedAppIds, pendingDeactivatedRoleIds, pendingHardDeletedAppIds, pendingHardDeletedRoleIds,
    selectedApp, isSelectedAppPendingDeactivation, expandedAppId,
    setDialog, setApplicationDraft, setRoleDraft,
    handleApplicationRowClick, handleApplicationReorder, handleCancelOrderChanges, handleSaveOrderChanges,
    closeDialog, openEditApplicationDialog, openToggleApplicationDialog, openDeactivateApplicationDialog,
    stageHardDeleteApplication, unstageHardDeleteApplication, openAddApplicationDialog,
    submitAddApplication, submitEditApplication, submitToggleApplication, submitDeactivateApplication,
    handleInlineEditApplication, handleInlineEditRole,
    editingAppId, startEditingApp, stopEditingApp, editingRoleId, startEditingRole, stopEditingRole,
    ...roleActions,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────


function batchMarker(batchState) {
  if (batchState === "hardDeleted") return { text: "Deleted", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "deleted") return { text: "Deactivated", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "created") return { text: "New", cls: "psb-batch-marker psb-batch-marker-new" };
  if (batchState === "updated") return { text: "Edited", cls: "psb-batch-marker psb-batch-marker-edited" };
  return { text: "", cls: "" };
}

function ApplicationHeader({ hasPendingChanges, pendingSummary, isSavingOrder, isMutatingAction, handleSaveOrderChanges, handleCancelOrderChanges, openAddApplicationDialog }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h1 className="h3 mb-1">Configuration and Settings</h1>
        <p className="text-muted mb-0">Manage setup tables and mapping assignments for User Master.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
          {isMutatingAction || isSavingOrder ? "Saving batch..." : hasPendingChanges ? `${pendingSummary.total} staged change(s)` : "No changes"}
        </span>
        {hasPendingChanges ? (
          <>
            {pendingSummary.applicationAdded + pendingSummary.roleAdded > 0 ? <span className="psb-batch-chip psb-batch-chip-added">+{pendingSummary.applicationAdded + pendingSummary.roleAdded} Added</span> : null}
            {pendingSummary.applicationEdited + pendingSummary.roleEdited > 0 ? <span className="psb-batch-chip psb-batch-chip-edited">~{pendingSummary.applicationEdited + pendingSummary.roleEdited} Edited</span> : null}
            {pendingSummary.applicationDeactivated + pendingSummary.roleDeactivated > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.applicationDeactivated + pendingSummary.roleDeactivated} Deactivated</span> : null}
            {pendingSummary.rowOrderChanged > 0 ? <span className="psb-batch-chip psb-batch-chip-order">Reordered</span> : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingOrder} disabled={!hasPendingChanges || isSavingOrder || isMutatingAction} onClick={handleSaveOrderChanges}>Save Batch</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingOrder || isMutatingAction} onClick={handleCancelOrderChanges}>Cancel Batch</Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingOrder || isMutatingAction} onClick={openAddApplicationDialog}>+ Add Application</Button>
      </div>
    </div>
  );
}

function ApplicationTable({
  decoratedApplications, decoratedSelectedAppRoles, selectedApp, expandedAppId, isSavingOrder, isMutatingAction,
  pendingDeactivatedAppIds, pendingDeactivatedRoleIds,
  handleApplicationRowClick, handleApplicationReorder,
  editingAppId, onStartEditing, onStopEditing, onInlineEdit,
  openToggleApplicationDialog, openDeactivateApplicationDialog, stageHardDeleteApplication, onUndoBatchAction,
  openAddRoleDialog,
  // role props
  editingRoleId, onStartEditingRole, onStopEditingRole, onInlineEditRole,
  openToggleRoleDialog, openDeactivateRoleDialog, stageHardDeleteRole, onUndoBatchActionRole,
}) {
  const columns = useMemo(() => [
    { key: "app_id", label: "App ID", width: "10%", sortable: true, render: (row) => <span className="text-muted small">{row?.app_id ?? "--"}</span> },
    { key: "app_name", label: "Application Name", width: "24%", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || ""); const isEditing = String(row?.app_id ?? "") === String(editingAppId ?? ""); const editDisabled = !isEditing || isSavingOrder || isMutatingAction; const isSelected = isSameId(row?.app_id, selectedApp?.app_id);
      return (<span className={isSelected ? "fw-semibold text-primary" : ""}><InlineEditCell value={row?.app_name || ""} onCommit={(val) => onInlineEdit?.(row, "app_name", val)} onCancel={onStopEditing} disabled={editDisabled} />{m.text ? <span className={m.cls}>{m.text}</span> : null}</span>);
    }},
    { key: "module_key", label: "Module Key", width: "18%", sortable: true, render: (row) => {
      const isEditing = String(row?.app_id ?? "") === String(editingAppId ?? ""); const editDisabled = !isEditing || isSavingOrder || isMutatingAction;
      return <InlineEditCell value={row?.module_key || ""} onCommit={(val) => onInlineEdit?.(row, "module_key", val)} onCancel={onStopEditing} disabled={editDisabled} />;
    }},
    { key: "app_desc", label: "Description", width: "28%", sortable: true, render: (row) => {
      const isEditing = String(row?.app_id ?? "") === String(editingAppId ?? ""); const editDisabled = !isEditing || isSavingOrder || isMutatingAction;
      return <InlineEditCell value={row?.app_desc || ""} onCommit={(val) => onInlineEdit?.(row, "app_desc", val)} onCancel={onStopEditing} disabled={editDisabled} />;
    }},
    { key: "is_active_bool", label: "Active", width: "12%", sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], [editingAppId, isMutatingAction, isSavingOrder, onInlineEdit, onStopEditing, selectedApp?.app_id]);

  const actions = useMemo(() => [
    { key: "edit-application", label: "Edit", type: "secondary", icon: "pen", visible: (r) => String(r?.app_id ?? "") !== String(editingAppId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => onStartEditing(r) },
    { key: "cancel-edit-application", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => String(r?.app_id ?? "") === String(editingAppId ?? ""), onClick: () => onStopEditing() },
    { key: "add-role", label: "+ Add Role", type: "success", icon: "plus", visible: (r) => String(r?.app_id ?? "") !== String(editingAppId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: () => openAddRoleDialog() },
    { key: "restore-application", label: "Restore", type: "secondary", icon: "rotate-left", visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedAppIds.has(String(r?.app_id ?? ""))) && String(r?.app_id ?? "") !== String(editingAppId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => openToggleApplicationDialog(r) },
    { key: "deactivate-application", label: "Deactivate", type: "secondary", icon: "ban", visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedAppIds.has(String(r?.app_id ?? "")) && String(r?.app_id ?? "") !== String(editingAppId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => openDeactivateApplicationDialog(r) },
    { key: "delete-application", label: "Delete", type: "danger", icon: "trash", visible: (r) => String(r?.app_id ?? "") !== String(editingAppId ?? ""), confirm: true, confirmMessage: (r) => `Permanently delete ${r?.app_name || "this application"}? This action cannot be undone.`, disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => stageHardDeleteApplication(r) },
  ], [editingAppId, isMutatingAction, isSavingOrder, onStartEditing, onStopEditing, openAddRoleDialog, openDeactivateApplicationDialog, openToggleApplicationDialog, pendingDeactivatedAppIds, stageHardDeleteApplication]);

  // ── Role columns for nested detail ──
  const roleColumns = useMemo(() => [
    { key: "role_name", label: "Role Name", width: "30%", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || ""); const isEditing = String(row?.role_id ?? "") === String(editingRoleId ?? ""); const editDisabled = !isEditing || isSavingOrder || isMutatingAction;
      return (<span><InlineEditCell value={row?.role_name || ""} onCommit={(val) => onInlineEditRole?.(row, "role_name", val)} onCancel={onStopEditingRole} disabled={editDisabled} />{m.text ? <span className={m.cls}>{m.text}</span> : null}</span>);
    }},
    { key: "role_desc", label: "Description", width: "44%", sortable: true, render: (row) => {
      const isEditing = String(row?.role_id ?? "") === String(editingRoleId ?? ""); const editDisabled = !isEditing || isSavingOrder || isMutatingAction;
      return <InlineEditCell value={row?.role_desc || ""} onCommit={(val) => onInlineEditRole?.(row, "role_desc", val)} onCancel={onStopEditingRole} disabled={editDisabled} />;
    }},
    { key: "is_active_bool", label: "Active", width: "16%", sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], [editingRoleId, isMutatingAction, isSavingOrder, onInlineEditRole, onStopEditingRole]);

  const roleActions = useMemo(() => [
    { key: "edit-role", label: "Edit", type: "secondary", icon: "pen", visible: (r) => String(r?.role_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => onStartEditingRole(r) },
    { key: "cancel-edit-role", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => String(r?.role_id ?? "") === String(editingRoleId ?? ""), onClick: () => onStopEditingRole() },
    { key: "restore-role", label: "Restore", type: "secondary", icon: "rotate-left", visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedRoleIds.has(String(r?.role_id ?? ""))) && String(r?.role_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => openToggleRoleDialog(r) },
    { key: "deactivate-role", label: "Deactivate", type: "secondary", icon: "ban", visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedRoleIds.has(String(r?.role_id ?? "")) && String(r?.role_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => openDeactivateRoleDialog(r) },
    { key: "delete-role", label: "Delete", type: "danger", icon: "trash", visible: (r) => String(r?.role_id ?? "") !== String(editingRoleId ?? ""), confirm: true, confirmMessage: (r) => `Permanently delete ${r?.role_name || "this role"}? This action cannot be undone.`, disabled: () => isSavingOrder || isMutatingAction, onClick: (r) => stageHardDeleteRole(r) },
  ], [editingRoleId, isMutatingAction, isSavingOrder, onStartEditingRole, onStopEditingRole, openDeactivateRoleDialog, openToggleRoleDialog, pendingDeactivatedRoleIds, stageHardDeleteRole]);

  const renderAppDetail = useCallback(() => {
    if (!selectedApp) return null;
    return (
      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0 small fw-semibold">Roles for: {selectedApp.app_name}</h6>
        </div>
        <TableZ columns={roleColumns} data={decoratedSelectedAppRoles} rowIdKey="role_id"
          actions={roleActions} hideFooter hideSearch
          emptyMessage="No roles assigned to this application."
          onUndoBatchAction={onUndoBatchActionRole} />
      </div>
    );
  }, [decoratedSelectedAppRoles, onUndoBatchActionRole, roleActions, roleColumns, selectedApp]);

  return (
    <TableZ columns={columns} data={decoratedApplications} rowIdKey="app_id"
      selectedRowId={expandedAppId} onRowClick={handleApplicationRowClick}
      actions={actions} hideFooter
      draggable={!isSavingOrder && !isMutatingAction} onReorder={handleApplicationReorder}
      renderDetail={renderAppDetail}
      emptyMessage="No applications found."
      onUndoBatchAction={onUndoBatchAction} />
  );
}

function ApplicationDialog({ dialog, applicationDraft, roleDraft, isMutatingAction, setApplicationDraft, setRoleDraft, closeDialog, submitAddApplication, submitEditApplication, submitToggleApplication, submitDeactivateApplication, submitEditRole, submitToggleRole, submitDeactivateRole, submitAddRole }) {
  const kind = dialog?.kind;
  const dialogTitle = useMemo(() => {
    const titles = { "add-application": "Add Application", "edit-application": "Edit Application", "toggle-application": `${dialog?.nextIsActive ? "Enable" : "Disable"} Application`, "deactivate-application": "Deactivate Application", "edit-role": "Edit Role", "toggle-role": `${dialog?.nextIsActive ? "Enable" : "Disable"} Role`, "deactivate-role": "Deactivate Role", "add-role": "Add Role" };
    return titles[kind] || "";
  }, [kind, dialog?.nextIsActive]);

  if (!kind) return null;
  const isBusy = isMutatingAction;
  const submitMap = { "add-application": submitAddApplication, "edit-application": submitEditApplication, "toggle-application": submitToggleApplication, "deactivate-application": submitDeactivateApplication, "edit-role": submitEditRole, "toggle-role": submitToggleRole, "deactivate-role": submitDeactivateRole, "add-role": submitAddRole };
  const footerConfig = { "add-application": { label: "Add Application", variant: "success" }, "edit-application": { label: "Save", variant: "primary" }, "edit-role": { label: "Save", variant: "primary" }, "add-role": { label: "Add Role", variant: "success" }, "toggle-application": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" }, "toggle-role": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" }, "deactivate-application": { label: "Deactivate Application", variant: "warning" }, "deactivate-role": { label: "Deactivate Role", variant: "warning" } };
  const fc = footerConfig[kind] || { label: "OK", variant: "primary" };
  const footer = (<><Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button><Button type="button" variant={fc.variant} onClick={submitMap[kind]} loading={isBusy}>{fc.label}</Button></>);
  const isAppForm = kind === "add-application" || kind === "edit-application";
  const isRoleForm = kind === "edit-role" || kind === "add-role";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} footer={footer}>
      {isAppForm ? (
        <div className="d-flex flex-column gap-3">
          <div><label className="form-label mb-1">Application Name</label><Input value={applicationDraft.name} onChange={(e) => setApplicationDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter application name" autoFocus /></div>
          <div><label className="form-label mb-1">Module Key</label><Input value={applicationDraft.moduleKey} onChange={(e) => { const raw = e.target.value; const normalized = normalizeModuleKey(raw); setApplicationDraft((p) => ({ ...p, moduleKey: raw })); if (raw !== normalized && raw.length > 0) { setApplicationDraft((p) => ({ ...p, moduleKey: normalized })); } }} placeholder="Enter module key" /><small className="text-muted d-block mt-1">Unique identifier used internally by the platform.</small></div>
          <div><label className="form-label mb-1">Description</label><Input as="textarea" rows={3} value={applicationDraft.desc} onChange={(e) => setApplicationDraft((p) => ({ ...p, desc: e.target.value }))} placeholder="Enter application description" /></div>
        </div>
      ) : null}
      {isRoleForm ? (
        <div className="d-flex flex-column gap-3">
          {kind === "add-role" ? <div className="small text-muted">Creating role for <strong>{dialog?.target?.app_name || "selected application"}</strong></div> : null}
          <div><label className="form-label mb-1">Role Name</label><Input value={roleDraft.name} onChange={(e) => setRoleDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter role name" autoFocus /></div>
          <div><label className="form-label mb-1">Description</label><Input as="textarea" rows={3} value={roleDraft.desc} onChange={(e) => setRoleDraft((p) => ({ ...p, desc: e.target.value }))} placeholder="Enter role description" /></div>
        </div>
      ) : null}
      {kind === "toggle-application" ? <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} application <strong>{dialog?.target?.app_name || ""}</strong>?</p> : null}
      {kind === "toggle-role" ? <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} role <strong>{dialog?.target?.role_name || ""}</strong>?</p> : null}
      {kind === "deactivate-application" ? <p className="mb-0 text-danger">Deactivate application <strong>{dialog?.target?.app_name || ""}</strong> and all associated roles?</p> : null}
      {kind === "deactivate-role" ? <p className="mb-0 text-danger">Deactivate role <strong>{dialog?.target?.role_name || ""}</strong>?</p> : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function ApplicationSetupView({ applications, roles, initialSelectedAppId }) {
  const h = useApplicationSetup({ applications, roles, initialSelectedAppId });

  return (
    <main className="container py-4">
      <ApplicationHeader
        hasPendingChanges={h.hasPendingChanges} pendingSummary={h.pendingSummary}
        isSavingOrder={h.isSavingOrder} isMutatingAction={h.isMutatingAction}
        handleSaveOrderChanges={h.handleSaveOrderChanges} handleCancelOrderChanges={h.handleCancelOrderChanges}
        openAddApplicationDialog={h.openAddApplicationDialog}
      />

      <ApplicationTable
        decoratedApplications={h.decoratedApplications} decoratedSelectedAppRoles={h.decoratedSelectedAppRoles}
        selectedApp={h.selectedApp} expandedAppId={h.expandedAppId}
        isSavingOrder={h.isSavingOrder} isMutatingAction={h.isMutatingAction}
        pendingDeactivatedAppIds={h.pendingDeactivatedAppIds} pendingDeactivatedRoleIds={h.pendingDeactivatedRoleIds}
        handleApplicationRowClick={h.handleApplicationRowClick} handleApplicationReorder={h.handleApplicationReorder}
        editingAppId={h.editingAppId} onStartEditing={h.startEditingApp} onStopEditing={h.stopEditingApp}
        onInlineEdit={h.handleInlineEditApplication}
        openToggleApplicationDialog={h.openToggleApplicationDialog} openDeactivateApplicationDialog={h.openDeactivateApplicationDialog}
        stageHardDeleteApplication={h.stageHardDeleteApplication} onUndoBatchAction={h.unstageHardDeleteApplication}
        openAddRoleDialog={h.openAddRoleDialog}
        editingRoleId={h.editingRoleId} onStartEditingRole={h.startEditingRole} onStopEditingRole={h.stopEditingRole}
        onInlineEditRole={h.handleInlineEditRole}
        openToggleRoleDialog={h.openToggleRoleDialog} openDeactivateRoleDialog={h.openDeactivateRoleDialog}
        stageHardDeleteRole={h.stageHardDeleteRole} onUndoBatchActionRole={h.unstageHardDeleteRole}
      />

      <ApplicationDialog
        dialog={h.dialog} applicationDraft={h.applicationDraft} roleDraft={h.roleDraft}
        isMutatingAction={h.isMutatingAction}
        setApplicationDraft={h.setApplicationDraft} setRoleDraft={h.setRoleDraft}
        closeDialog={h.closeDialog}
        submitAddApplication={h.submitAddApplication} submitEditApplication={h.submitEditApplication}
        submitToggleApplication={h.submitToggleApplication} submitDeactivateApplication={h.submitDeactivateApplication}
        submitEditRole={h.submitEditRole} submitToggleRole={h.submitToggleRole}
        submitDeactivateRole={h.submitDeactivateRole} submitAddRole={h.submitAddRole}
      />
    </main>
  );
}
