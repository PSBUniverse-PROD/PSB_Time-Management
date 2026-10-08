"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InlineEditCell, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  isSameId, compareText,
  mapOrgRoleRow, mapUserOrgRoleRow, removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_ORG_ROLE_PREFIX, TEMP_USER_ORG_ROLE_PREFIX, createTempId,
  isTempOrgRoleId, isTempUserOrgRoleId, createEmptyOrgRoleBatchState, executeOrgRoleBatchSave,
  batchMarker,
} from "../data/workflow.data.js";

// ─── HOOK: useOrgRoleSetup ─────────────────────────────────

function useOrgRoleSetup({ orgRoles = [], userOrgRoles = [], users = [] }) {
  const router = useRouter();

  const seedRoles = useMemo(
    () => (Array.isArray(orgRoles) ? orgRoles : [])
      .map((r, i) => mapOrgRoleRow(r, i))
      .sort((a, b) => compareText(a.ref_name, b.ref_name)),
    [orgRoles],
  );

  const seedUserRoles = useMemo(
    () => (Array.isArray(userOrgRoles) ? userOrgRoles : []).map((ur, i) => mapUserOrgRoleRow(ur, i)),
    [userOrgRoles],
  );

  const userOptions = useMemo(() => (Array.isArray(users) ? users : []), [users]);

  const [orderedRoles, setOrderedRoles] = useState(seedRoles);
  const [allUserRoles, setAllUserRoles] = useState(seedUserRoles);
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(createEmptyOrgRoleBatchState());
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [roleDraft, setRoleDraft] = useState({ name: "", desc: "" });
  const [userRoleDraft, setUserRoleDraft] = useState({ userId: "", isPrimary: false, isActive: true });
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editingUserRoleId, setEditingUserRoleId] = useState(null);
  const [expandedRoleId, setExpandedRoleId] = useState(null);
  const batchActiveRef = useRef(false);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedRoles(seedRoles); setAllUserRoles(seedUserRoles);
    setIsMutatingAction(false); setIsSavingBatch(false);
    setPendingBatch(createEmptyOrgRoleBatchState()); setDialog(EMPTY_DIALOG);
    setRoleDraft({ name: "", desc: "" }); setUserRoleDraft({ userId: "", isPrimary: false, isActive: true });
    setEditingRoleId(null); setEditingUserRoleId(null);
  }, [seedRoles, seedUserRoles]);

  const pendingSummary = useMemo(() => {
    const rA = pendingBatch.roleCreates.length;
    const rE = Object.entries(pendingBatch.roleUpdates || {}).filter(([id, patch]) => {
      const seed = seedRoles.find((r) => isSameId(r?.orgrole_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const rD = pendingBatch.roleDeactivations.length, rH = (pendingBatch.roleHardDeletes || []).length;
    const uA = pendingBatch.userRoleCreates.length;
    const uE = Object.entries(pendingBatch.userRoleUpdates || {}).filter(([id, patch]) => {
      const seed = seedUserRoles.find((u) => isSameId(u?.user_orgrole_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const uD = pendingBatch.userRoleDeactivations.length, uH = (pendingBatch.userRoleHardDeletes || []).length;
    return { roleAdded: rA, roleEdited: rE, roleDeactivated: rD, roleHardDeleted: rH, userAdded: uA, userEdited: uE, userDeactivated: uD, userHardDeleted: uH, total: rA + rE + rD + rH + uA + uE + uD + uH };
  }, [pendingBatch, seedRoles, seedUserRoles]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedRoleIds = useMemo(() => new Set((pendingBatch.roleDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.roleDeactivations]);
  const pendingDeactivatedUserRoleIds = useMemo(() => new Set((pendingBatch.userRoleDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.userRoleDeactivations]);
  const pendingHardDeletedRoleIds = useMemo(() => new Set((pendingBatch.roleHardDeletes || []).map((id) => String(id ?? ""))), [pendingBatch.roleHardDeletes]);
  const pendingHardDeletedUserRoleIds = useMemo(() => new Set((pendingBatch.userRoleHardDeletes || []).map((id) => String(id ?? ""))), [pendingBatch.userRoleHardDeletes]);

  const selectedRole = useMemo(() => orderedRoles.find((r) => isSameId(r?.orgrole_id, expandedRoleId)) ?? null, [orderedRoles, expandedRoleId]);
  const isSelectedRolePendingDeactivation = useMemo(() => pendingDeactivatedRoleIds.has(String(selectedRole?.orgrole_id ?? "")), [pendingDeactivatedRoleIds, selectedRole?.orgrole_id]);
  const selectedRoleUserRoles = useMemo(() => allUserRoles.filter((u) => isSameId(u?.role_id, selectedRole?.orgrole_id)).sort((a, b) => compareText(String(a?.user_id || ""), String(b?.user_id || ""))), [allUserRoles, selectedRole?.orgrole_id]);

  const decoratedRoles = useMemo(() => {
    const cIds = new Set((pendingBatch.roleCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.roleUpdates || {}).filter(([id, patch]) => {
      const seed = seedRoles.find((r) => isSameId(r?.orgrole_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.roleDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.roleHardDeletes || []).map((e) => String(e ?? "")));
    return orderedRoles.map((row) => {
      const id = String(row?.orgrole_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [orderedRoles, pendingBatch.roleCreates, pendingBatch.roleDeactivations, pendingBatch.roleHardDeletes, pendingBatch.roleUpdates, seedRoles]);

  const decoratedSelectedRoleUserRoles = useMemo(() => {
    const cIds = new Set((pendingBatch.userRoleCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.userRoleUpdates || {}).filter(([id, patch]) => {
      const seed = seedUserRoles.find((u) => isSameId(u?.user_orgrole_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.userRoleDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.userRoleHardDeletes || []).map((e) => String(e ?? "")));
    return selectedRoleUserRoles.map((row) => {
      const id = String(row?.user_orgrole_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [pendingBatch.userRoleCreates, pendingBatch.userRoleDeactivations, pendingBatch.userRoleHardDeletes, pendingBatch.userRoleUpdates, seedUserRoles, selectedRoleUserRoles]);

  const handleRoleRowClick = useCallback((row) => {
    const roleId = row?.orgrole_id;
    setExpandedRoleId((prev) => isSameId(prev, roleId) ? null : roleId);
  }, []);

  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedRoles(seedRoles); setAllUserRoles(seedUserRoles);
    setPendingBatch(createEmptyOrgRoleBatchState()); setDialog(EMPTY_DIALOG);
    setRoleDraft({ name: "", desc: "" }); setUserRoleDraft({ userId: "", isPrimary: false, isActive: true });
    setEditingRoleId(null); setEditingUserRoleId(null);
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, seedRoles, seedUserRoles]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true); setIsMutatingAction(true);
    try {
      await executeOrgRoleBatchSave(pendingBatch);
      setPendingBatch(createEmptyOrgRoleBatchState());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally { setIsMutatingAction(false); setIsSavingBatch(false); setEditingRoleId(null); setEditingUserRoleId(null); }
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, pendingBatch, pendingSummary.total, router]);

  const closeDialog = useCallback(() => { if (!isMutatingAction && !isSavingBatch) setDialog(EMPTY_DIALOG); }, [isMutatingAction, isSavingBatch]);

  // ── Role dialog actions ──

  const openAddRoleDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setRoleDraft({ name: "", desc: "" });
    setDialog({ kind: "add-role", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch]);

  const openEditRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setRoleDraft({ name: String(row?.ref_name || ""), desc: String(row?.ref_desc === "--" ? "" : (row?.ref_desc || "")) });
    setDialog({ kind: "edit-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const roleId = String(row?.orgrole_id ?? "");
    if (pendingDeactivatedRoleIds.has(roleId)) {
      const linkedUserRoleIds = allUserRoles.filter((u) => isSameId(u?.role_id, roleId)).map((u) => String(u?.user_orgrole_id ?? ""));
      setPendingBatch((prev) => ({ ...prev, roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)), userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))) }));
      toastSuccess("Org role deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-role", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [allUserRoles, isMutatingAction, isSavingBatch, pendingDeactivatedRoleIds]);

  const openDeactivateRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteRole = useCallback((row) => {
    const roleId = String(row?.orgrole_id ?? "");
    if (!roleId || isMutatingAction || isSavingBatch) return;
    const linkedUserRoleIds = allUserRoles.filter((u) => isSameId(u?.role_id, roleId)).map((u) => String(u?.user_orgrole_id ?? ""));
    if (isTempOrgRoleId(roleId)) {
      const nextRoles = orderedRoles.filter((r) => !isSameId(r?.orgrole_id, roleId));
      setOrderedRoles(nextRoles);
      setAllUserRoles((prev) => prev.filter((u) => !isSameId(u?.role_id, roleId)));
      setPendingBatch((prev) => ({ ...prev, roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.tempId, roleId)), roleUpdates: removeObjectKey(prev.roleUpdates, roleId), userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.payload?.role_id, roleId)), userRoleUpdates: linkedUserRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.userRoleUpdates), userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))), userRoleHardDeletes: (prev.userRoleHardDeletes || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))) }));
      if (isSameId(selectedRole?.orgrole_id, roleId)) setExpandedRoleId(null);
      toastSuccess("Staged org role removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({ ...prev, roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)), roleHardDeletes: appendUniqueId(prev.roleHardDeletes || [], roleId), userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.payload?.role_id, roleId)), userRoleUpdates: linkedUserRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.userRoleUpdates), userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))), userRoleHardDeletes: linkedUserRoleIds.reduce((ids, id) => isTempUserOrgRoleId(id) ? ids : appendUniqueId(ids, id), (prev.userRoleHardDeletes || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id)))) }));
    toastSuccess("Org role deletion staged for Save Batch.", "Batching");
  }, [allUserRoles, isMutatingAction, isSavingBatch, orderedRoles, selectedRole?.orgrole_id]);

  const unstageHardDeleteRole = useCallback((row) => {
    const roleId = String(row?.orgrole_id ?? "");
    if (!roleId || isMutatingAction || isSavingBatch) return;
    const linkedUserRoleIds = allUserRoles.filter((u) => isSameId(u?.role_id, roleId)).map((u) => String(u?.user_orgrole_id ?? ""));
    setPendingBatch((prev) => ({ ...prev, roleHardDeletes: (prev.roleHardDeletes || []).filter((id) => !isSameId(id, roleId)), userRoleHardDeletes: (prev.userRoleHardDeletes || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))) }));
    toastSuccess("Org role deletion un-staged.", "Batching");
  }, [allUserRoles, isMutatingAction, isSavingBatch]);

  const submitAddRole = useCallback(() => {
    const name = String(roleDraft.name || "").trim();
    if (!name) { toastError("Org role name is required."); return; }
    const desc = String(roleDraft.desc || "").trim();
    const tempRoleId = createTempId(TEMP_ORG_ROLE_PREFIX);
    setOrderedRoles((prev) => [...prev, mapOrgRoleRow({ orgrole_id: tempRoleId, name, description: desc || null, is_active: true }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, roleCreates: [...prev.roleCreates, { tempId: tempRoleId, payload: { name, description: desc || null, is_active: true } }] }));
    setDialog(EMPTY_DIALOG); setRoleDraft({ name: "", desc: "" });
    toastSuccess("Org role staged for Save Batch.", "Batching");
  }, [roleDraft]);

  const submitEditRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.orgrole_id) { toastError("Invalid org role."); return; }
    const name = String(roleDraft.name || "").trim();
    if (!name) { toastError("Org role name is required."); return; }
    const desc = String(roleDraft.desc || "").trim();
    const roleId = row.orgrole_id;
    setOrderedRoles((prev) => prev.map((r, i) => isSameId(r?.orgrole_id, roleId) ? mapOrgRoleRow({ ...r, name, description: desc || null }, i) : r));
    setPendingBatch((prev) => {
      if (isTempOrgRoleId(roleId)) return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, name, description: desc || null } } : e), roleUpdates: removeObjectKey(prev.roleUpdates, roleId) };
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { name, description: desc || null }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Org role update staged for Save Batch.", "Batching");
  }, [roleDraft, dialog]);

  const submitToggleRole = useCallback(() => {
    const row = dialog?.target;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.orgrole_id) { toastError("Invalid org role."); return; }
    const roleId = row.orgrole_id;
    setOrderedRoles((prev) => prev.map((r, i) => isSameId(r?.orgrole_id, roleId) ? mapOrgRoleRow({ ...r, is_active: nextIsActive }, i) : r));
    setPendingBatch((prev) => {
      if (isTempOrgRoleId(roleId)) return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e), roleUpdates: removeObjectKey(prev.roleUpdates, roleId) };
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { is_active: nextIsActive }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`Org role ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog]);

  const submitDeactivateRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.orgrole_id) { toastError("Invalid org role."); return; }
    const roleId = row.orgrole_id;
    const linkedUserRoleIds = allUserRoles.filter((u) => isSameId(u?.role_id, roleId)).map((u) => String(u?.user_orgrole_id ?? ""));
    if (isTempOrgRoleId(roleId)) {
      const nextRoles = orderedRoles.filter((r) => !isSameId(r?.orgrole_id, roleId));
      setOrderedRoles(nextRoles); setAllUserRoles((prev) => prev.filter((u) => !isSameId(u?.role_id, roleId)));
      setPendingBatch((prev) => ({ ...prev, roleCreates: prev.roleCreates.filter((e) => !isSameId(e?.tempId, roleId)), roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleDeactivations: (prev.roleDeactivations || []).filter((id) => !isSameId(id, roleId)), userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.payload?.role_id, roleId)), userRoleUpdates: linkedUserRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.userRoleUpdates), userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !linkedUserRoleIds.some((lu) => isSameId(lu, id))) }));
      if (isSameId(selectedRole?.orgrole_id, roleId)) setExpandedRoleId(null);
      setDialog(EMPTY_DIALOG);
      toastSuccess("Org role deactivation staged for Save Batch.", "Batching");
      return;
    }
    setPendingBatch((prev) => {
      const nextUserRoleDeactivations = linkedUserRoleIds.reduce((ids, id) => appendUniqueId(ids, id), prev.userRoleDeactivations || []);
      return { ...prev, roleUpdates: removeObjectKey(prev.roleUpdates, roleId), roleDeactivations: appendUniqueId(prev.roleDeactivations, roleId), userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.payload?.role_id, roleId)), userRoleUpdates: linkedUserRoleIds.reduce((m, id) => removeObjectKey(m, id), prev.userRoleUpdates), userRoleDeactivations: nextUserRoleDeactivations };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Org role deactivation staged for Save Batch.", "Batching");
  }, [allUserRoles, dialog, orderedRoles, selectedRole?.orgrole_id]);

  // ── User-in-charge dialog actions ──

  const openAddUserRoleDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    if (!selectedRole?.orgrole_id) { toastError("Select an org role before adding a user."); return; }
    if (isSelectedRolePendingDeactivation) { toastError("Selected org role is staged for deactivation. Save or cancel batch before adding a user."); return; }
    setUserRoleDraft({ userId: "", isPrimary: false, isActive: true });
    setDialog({ kind: "add-user-role", target: { role_id: selectedRole.orgrole_id, role_name: selectedRole.ref_name }, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch, isSelectedRolePendingDeactivation, selectedRole]);

  const openEditUserRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setUserRoleDraft({ userId: String(row?.user_id ?? ""), isPrimary: Boolean(row?.is_primary), isActive: Boolean(row?.is_active_bool) });
    setDialog({ kind: "edit-user-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const openToggleUserRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const userRoleId = String(row?.user_orgrole_id ?? "");
    if (pendingDeactivatedUserRoleIds.has(userRoleId)) {
      setPendingBatch((prev) => ({ ...prev, userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !isSameId(id, userRoleId)) }));
      toastSuccess("User deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-user-role", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedUserRoleIds]);

  const openDeactivateUserRoleDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-user-role", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  const stageHardDeleteUserRole = useCallback((row) => {
    const userRoleId = String(row?.user_orgrole_id ?? "");
    if (!userRoleId || isMutatingAction || isSavingBatch) return;
    if (isTempUserOrgRoleId(userRoleId)) {
      setAllUserRoles((prev) => prev.filter((u) => !isSameId(u?.user_orgrole_id, userRoleId)));
      setPendingBatch((prev) => ({ ...prev, userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.tempId, userRoleId)), userRoleUpdates: removeObjectKey(prev.userRoleUpdates, userRoleId) }));
      toastSuccess("Staged user removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({ ...prev, userRoleDeactivations: (prev.userRoleDeactivations || []).filter((id) => !isSameId(id, userRoleId)), userRoleUpdates: removeObjectKey(prev.userRoleUpdates, userRoleId), userRoleHardDeletes: appendUniqueId(prev.userRoleHardDeletes || [], userRoleId) }));
    toastSuccess("User deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const unstageHardDeleteUserRole = useCallback((row) => {
    const userRoleId = String(row?.user_orgrole_id ?? "");
    if (!userRoleId || isMutatingAction || isSavingBatch) return;
    setPendingBatch((prev) => ({ ...prev, userRoleHardDeletes: (prev.userRoleHardDeletes || []).filter((id) => !isSameId(id, userRoleId)) }));
    toastSuccess("User deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  const submitAddUserRole = useCallback(() => {
    const target = dialog?.target;
    if (!target?.role_id) { toastError("Select an org role before adding a user."); return; }
    const userId = String(userRoleDraft.userId || "").trim();
    if (!userId) { toastError("User is required."); return; }
    const isPrimary = Boolean(userRoleDraft.isPrimary);
    const isActive = Boolean(userRoleDraft.isActive);
    const tempUserRoleId = createTempId(TEMP_USER_ORG_ROLE_PREFIX);
    setAllUserRoles((prev) => [...prev, mapUserOrgRoleRow({ user_orgrole_id: tempUserRoleId, role_id: target.role_id, user_id: userId, is_active: isActive, is_primary: isPrimary }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, userRoleCreates: [...prev.userRoleCreates, { tempId: tempUserRoleId, payload: { role_id: target.role_id, user_id: userId, is_active: isActive, is_primary: isPrimary } }] }));
    setDialog(EMPTY_DIALOG);
    setUserRoleDraft({ userId: "", isPrimary: false, isActive: true });
    toastSuccess("User staged for Save Batch.", "Batching");
  }, [userRoleDraft, dialog]);

  const submitEditUserRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.user_orgrole_id) { toastError("Invalid user."); return; }
    const userId = String(userRoleDraft.userId || "").trim();
    if (!userId) { toastError("User is required."); return; }
    const isPrimary = Boolean(userRoleDraft.isPrimary);
    const isActive = Boolean(userRoleDraft.isActive);
    const userRoleId = row.user_orgrole_id;
    setAllUserRoles((prev) => prev.map((u, i) => isSameId(u?.user_orgrole_id, userRoleId) ? mapUserOrgRoleRow({ ...u, user_id: userId, is_active: isActive, is_primary: isPrimary }, i) : u));
    setPendingBatch((prev) => {
      if (isTempUserOrgRoleId(userRoleId)) {
        return { ...prev, userRoleCreates: prev.userRoleCreates.map((e) => isSameId(e?.tempId, userRoleId) ? { ...e, payload: { ...e.payload, user_id: userId, is_active: isActive, is_primary: isPrimary } } : e), userRoleUpdates: removeObjectKey(prev.userRoleUpdates, userRoleId) };
      }
      return { ...prev, userRoleUpdates: { ...prev.userRoleUpdates, [String(userRoleId)]: mergeUpdatePatch(prev.userRoleUpdates?.[String(userRoleId)], { user_id: userId, is_active: isActive, is_primary: isPrimary }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("User update staged for Save Batch.", "Batching");
  }, [userRoleDraft, dialog]);

  const submitToggleUserRole = useCallback(() => {
    const row = dialog?.target;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    if (!row?.user_orgrole_id) { toastError("Invalid user."); return; }
    const userRoleId = row.user_orgrole_id;
    setAllUserRoles((prev) => prev.map((u, i) => isSameId(u?.user_orgrole_id, userRoleId) ? mapUserOrgRoleRow({ ...u, is_active: nextIsActive }, i) : u));
    setPendingBatch((prev) => {
      if (isTempUserOrgRoleId(userRoleId)) {
        return { ...prev, userRoleCreates: prev.userRoleCreates.map((e) => isSameId(e?.tempId, userRoleId) ? { ...e, payload: { ...e.payload, is_active: nextIsActive } } : e), userRoleUpdates: removeObjectKey(prev.userRoleUpdates, userRoleId) };
      }
      return { ...prev, userRoleUpdates: { ...prev.userRoleUpdates, [String(userRoleId)]: mergeUpdatePatch(prev.userRoleUpdates?.[String(userRoleId)], { is_active: nextIsActive }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(`User ${nextIsActive ? "enable" : "disable"} staged for Save Batch.`, "Batching");
  }, [dialog]);

  const submitDeactivateUserRole = useCallback(() => {
    const row = dialog?.target;
    if (!row?.user_orgrole_id) { toastError("Invalid user."); return; }
    const userRoleId = row.user_orgrole_id;
    if (isTempUserOrgRoleId(userRoleId)) {
      setAllUserRoles((items) => items.filter((u) => !isSameId(u?.user_orgrole_id, userRoleId)));
      setPendingBatch((prev) => ({ ...prev, userRoleCreates: prev.userRoleCreates.filter((e) => !isSameId(e?.tempId, userRoleId)), userRoleUpdates: removeObjectKey(prev.userRoleUpdates, userRoleId) }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged user removed.", "Batching");
      return;
    }
    setPendingBatch((prev) => ({ ...prev, userRoleDeactivations: appendUniqueId(prev.userRoleDeactivations, userRoleId) }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("User deactivation staged for Save Batch.", "Batching");
  }, [dialog]);

  // ── Inline editing ──

  const startEditingRole = useCallback((row) => { if (isMutatingAction || isSavingBatch) return; const id = String(row?.orgrole_id ?? ""); setEditingRoleId((prev) => prev === id ? null : id); }, [isMutatingAction, isSavingBatch]);
  const stopEditingRole = useCallback(() => { setEditingRoleId(null); }, []);
  const startEditingUserRole = useCallback((row) => { if (isMutatingAction || isSavingBatch) return; const id = String(row?.user_orgrole_id ?? ""); setEditingUserRoleId((prev) => prev === id ? null : id); }, [isMutatingAction, isSavingBatch]);
  const stopEditingUserRole = useCallback(() => { setEditingUserRoleId(null); }, []);

  const handleInlineEditRole = useCallback((row, key, value) => {
    const roleId = row?.orgrole_id;
    if (!roleId || isMutatingAction || isSavingBatch) return;
    setOrderedRoles((prev) => prev.map((r, i) => isSameId(r?.orgrole_id, roleId) ? mapOrgRoleRow({ ...r, [key]: value || null }, i) : r));
    setPendingBatch((prev) => {
      if (isTempOrgRoleId(roleId)) return { ...prev, roleCreates: prev.roleCreates.map((e) => isSameId(e?.tempId, roleId) ? { ...e, payload: { ...e.payload, [key]: value || null } } : e) };
      return { ...prev, roleUpdates: { ...prev.roleUpdates, [String(roleId)]: mergeUpdatePatch(prev.roleUpdates?.[String(roleId)], { [key]: value || null }) } };
    });
  }, [isMutatingAction, isSavingBatch]);

  return {
    decoratedRoles, decoratedSelectedRoleUserRoles, dialog, roleDraft, userRoleDraft,
    isMutatingAction, isSavingBatch, pendingSummary, hasPendingChanges,
    pendingDeactivatedRoleIds, pendingDeactivatedUserRoleIds, pendingHardDeletedRoleIds, pendingHardDeletedUserRoleIds,
    selectedRole, isSelectedRolePendingDeactivation, expandedRoleId,
    userOptions,
    setDialog, setRoleDraft, setUserRoleDraft,
    handleRoleRowClick, handleCancelBatch, handleSaveBatch, closeDialog,
    openAddRoleDialog, openEditRoleDialog, openToggleRoleDialog, openDeactivateRoleDialog,
    stageHardDeleteRole, unstageHardDeleteRole, submitAddRole, submitEditRole, submitToggleRole, submitDeactivateRole,
    openAddUserRoleDialog, openEditUserRoleDialog, openToggleUserRoleDialog, openDeactivateUserRoleDialog,
    stageHardDeleteUserRole, unstageHardDeleteUserRole, submitAddUserRole, submitEditUserRole, submitToggleUserRole, submitDeactivateUserRole,
    handleInlineEditRole,
    editingRoleId, startEditingRole, stopEditingRole, editingUserRoleId, startEditingUserRole, stopEditingUserRole,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

function OrgRoleHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddRoleDialog }) {
  return (
    <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
      <div>
        <h4 className="mb-0">Org Roles</h4>
        <p className="text-muted small mb-0">Manage organizational roles and their users in charge.</p>
      </div>
      <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
        <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
          {isMutatingAction || isSavingBatch ? "Saving batch..." : hasPendingChanges ? `${pendingSummary.total} staged change(s)` : "No changes"}
        </span>
        {hasPendingChanges ? (
          <>
            {pendingSummary.roleAdded + pendingSummary.userAdded > 0 ? <span className="psb-batch-chip psb-batch-chip-added">+{pendingSummary.roleAdded + pendingSummary.userAdded} Added</span> : null}
            {pendingSummary.roleEdited + pendingSummary.userEdited > 0 ? <span className="psb-batch-chip psb-batch-chip-edited">~{pendingSummary.roleEdited + pendingSummary.userEdited} Edited</span> : null}
            {pendingSummary.roleDeactivated + pendingSummary.userDeactivated > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingSummary.roleDeactivated + pendingSummary.userDeactivated} Deactivated</span> : null}
          </>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>Save Batch</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>Cancel Batch</Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddRoleDialog}>+ Add Org Role</Button>
      </div>
    </div>
  );
}

function OrgRoleTable({
  decoratedRoles, decoratedSelectedRoleUserRoles, selectedRole, expandedRoleId, isMutatingAction, isSavingBatch,
  pendingDeactivatedRoleIds, pendingDeactivatedUserRoleIds,
  handleRoleRowClick,
  editingRoleId, onStartEditingRole, onStopEditingRole, onInlineEditRole,
  openToggleRoleDialog, openDeactivateRoleDialog, stageHardDeleteRole, onUndoBatchActionRole,
  openAddUserRoleDialog,
  editingUserRoleId, onStartEditingUserRole, onStopEditingUserRole,
  openEditUserRoleDialog, openToggleUserRoleDialog, openDeactivateUserRoleDialog, stageHardDeleteUserRole, onUndoBatchActionUserRole,
  userOptions,
}) {
  const getUserLabel = (user) => {
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    return fullName ? `${fullName} (${user?.username || ""})` : (user?.username || "Unknown");
  };

  const columns = useMemo(() => [
    { key: "orgrole_id", label: "Role ID", width: "12%", sortable: true, render: (row) => <span className="text-muted small">{row?.orgrole_id ?? "--"}</span> },
    { key: "ref_name", label: "Org Role Name", width: "30%", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || ""); const isEditing = String(row?.orgrole_id ?? "") === String(editingRoleId ?? ""); const editDisabled = !isEditing || isMutatingAction || isSavingBatch; const isSelected = isSameId(row?.orgrole_id, selectedRole?.orgrole_id);
      return (<span className={isSelected ? "fw-semibold text-primary" : ""}><InlineEditCell value={row?.ref_name || ""} onCommit={(val) => onInlineEditRole?.(row, "name", val)} onCancel={onStopEditingRole} disabled={editDisabled} />{m.text ? <span className={m.cls}>{m.text}</span> : null}</span>);
    }},
    { key: "ref_desc", label: "Description", width: "40%", sortable: true, render: (row) => {
      const isEditing = String(row?.orgrole_id ?? "") === String(editingRoleId ?? ""); const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
      return <InlineEditCell value={row?.ref_desc === "--" ? "" : (row?.ref_desc || "")} onCommit={(val) => onInlineEditRole?.(row, "description", val)} onCancel={onStopEditingRole} disabled={editDisabled} />;
    }},
    { key: "is_active_bool", label: "Active", width: "12%", sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], [editingRoleId, isMutatingAction, isSavingBatch, onInlineEditRole, onStopEditingRole, selectedRole?.orgrole_id]);

  const actions = useMemo(() => [
    { key: "edit-role", label: "Edit", type: "secondary", icon: "pen", visible: (r) => String(r?.orgrole_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => onStartEditingRole(r) },
    { key: "cancel-edit-role", label: "Cancel", type: "secondary", icon: "xmark", visible: (r) => String(r?.orgrole_id ?? "") === String(editingRoleId ?? ""), onClick: () => onStopEditingRole() },
    { key: "add-user", label: "+ Add User", type: "success", icon: "plus", visible: (r) => String(r?.orgrole_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: () => openAddUserRoleDialog() },
    { key: "restore-role", label: "Restore", type: "secondary", icon: "rotate-left", visible: (r) => (!Boolean(r?.is_active_bool) || pendingDeactivatedRoleIds.has(String(r?.orgrole_id ?? ""))) && String(r?.orgrole_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => openToggleRoleDialog(r) },
    { key: "deactivate-role", label: "Deactivate", type: "secondary", icon: "ban", visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedRoleIds.has(String(r?.orgrole_id ?? "")) && String(r?.orgrole_id ?? "") !== String(editingRoleId ?? ""), disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => openDeactivateRoleDialog(r) },
    { key: "delete-role", label: "Delete", type: "danger", icon: "trash", visible: (r) => String(r?.orgrole_id ?? "") !== String(editingRoleId ?? ""), confirm: true, confirmMessage: (r) => `Permanently delete ${r?.ref_name || "this org role"}? This will also remove its users in charge.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => stageHardDeleteRole(r) },
  ], [editingRoleId, isMutatingAction, isSavingBatch, onStartEditingRole, onStopEditingRole, openAddUserRoleDialog, openDeactivateRoleDialog, openToggleRoleDialog, pendingDeactivatedRoleIds, stageHardDeleteRole]);

  // ── User-in-charge (detail) columns & actions ──
  const userRoleColumns = useMemo(() => [
    { key: "user_id", label: "User", width: "46%", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || ""); const isEditing = String(row?.user_orgrole_id ?? "") === String(editingUserRoleId ?? ""); const editDisabled = !isEditing || isMutatingAction || isSavingBatch;
      const user = userOptions.find((u) => isSameId(u?.user_id, row?.user_id));
      return (<span><span className="small">{user ? getUserLabel(user) : (row?.user_id || "--")}</span>{m.text ? <span className={m.cls}>{m.text}</span> : null}</span>);
    }},
    { key: "is_primary", label: "Primary", width: "16%", sortable: true, align: "center", render: (row) => (row?.is_primary ? <span className="psb-batch-chip psb-batch-chip-added">Primary</span> : <span className="text-muted small">--</span>) },
    { key: "is_active_bool", label: "Active", width: "14%", sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], [editingUserRoleId, isMutatingAction, isSavingBatch, userOptions]);

  const userRoleActions = useMemo(() => [
    { key: "edit-user-role", label: "Edit", type: "secondary", icon: "pen", disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => openEditUserRoleDialog(r) },
    { key: "restore-user-role", label: "Restore", type: "secondary", icon: "rotate-left", visible: (r) => !Boolean(r?.is_active_bool) || pendingDeactivatedUserRoleIds.has(String(r?.user_orgrole_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => openToggleUserRoleDialog(r) },
    { key: "deactivate-user-role", label: "Deactivate", type: "secondary", icon: "ban", visible: (r) => Boolean(r?.is_active_bool) && !pendingDeactivatedUserRoleIds.has(String(r?.user_orgrole_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => openDeactivateUserRoleDialog(r) },
    { key: "delete-user-role", label: "Delete", type: "danger", icon: "trash", confirm: true, confirmMessage: () => `Permanently delete this user from the org role? This action cannot be undone.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (r) => stageHardDeleteUserRole(r) },
  ], [isMutatingAction, isSavingBatch, openDeactivateUserRoleDialog, openEditUserRoleDialog, openToggleUserRoleDialog, pendingDeactivatedUserRoleIds, stageHardDeleteUserRole]);

  const renderRoleDetail = useCallback(() => {
    if (!selectedRole) return null;
    return (
      <div>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h6 className="mb-0 small fw-semibold">Users In Charge for: {selectedRole.ref_name}</h6>
        </div>
        <TableZ columns={userRoleColumns} data={decoratedSelectedRoleUserRoles} rowIdKey="user_orgrole_id"
          actions={userRoleActions} hideFooter hideSearch
          emptyMessage="No users assigned to this org role."
          onUndoBatchAction={onUndoBatchActionUserRole} />
      </div>
    );
  }, [decoratedSelectedRoleUserRoles, onUndoBatchActionUserRole, selectedRole, userRoleActions, userRoleColumns]);

  return (
    <TableZ columns={columns} data={decoratedRoles} rowIdKey="orgrole_id"
      selectedRowId={expandedRoleId} onRowClick={handleRoleRowClick}
      actions={actions} hideFooter
      renderDetail={renderRoleDetail}
      emptyMessage="No org roles found."
      onUndoBatchAction={onUndoBatchActionRole} />
  );
}

function OrgRoleDialog({
  dialog, roleDraft, userRoleDraft, isMutatingAction, isSavingBatch,
  setRoleDraft, setUserRoleDraft, closeDialog,
  submitAddRole, submitEditRole, submitToggleRole, submitDeactivateRole,
  submitAddUserRole, submitEditUserRole, submitToggleUserRole, submitDeactivateUserRole,
  userOptions, selectedRole,
}) {
  const kind = dialog?.kind;
  const dialogTitle = useMemo(() => {
    const titles = {
      "add-role": "Add Org Role", "edit-role": "Edit Org Role",
      "toggle-role": `${dialog?.nextIsActive ? "Enable" : "Disable"} Org Role`,
      "deactivate-role": "Deactivate Org Role",
      "add-user-role": "Add User in Charge", "edit-user-role": "Edit User in Charge",
      "toggle-user-role": `${dialog?.nextIsActive ? "Enable" : "Disable"} User`,
      "deactivate-user-role": "Deactivate User",
    };
    return titles[kind] || "";
  }, [kind, dialog?.nextIsActive]);

  if (!kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;
  const submitMap = {
    "add-role": submitAddRole, "edit-role": submitEditRole,
    "toggle-role": submitToggleRole, "deactivate-role": submitDeactivateRole,
    "add-user-role": submitAddUserRole, "edit-user-role": submitEditUserRole,
    "toggle-user-role": submitToggleUserRole, "deactivate-user-role": submitDeactivateUserRole,
  };
  const footerConfig = {
    "add-role": { label: "Add Org Role", variant: "success" },
    "edit-role": { label: "Save", variant: "primary" },
    "add-user-role": { label: "Add User", variant: "success" },
    "edit-user-role": { label: "Save", variant: "primary" },
    "toggle-role": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" },
    "toggle-user-role": { label: dialog?.nextIsActive ? "Enable" : "Disable", variant: "secondary" },
    "deactivate-role": { label: "Deactivate Org Role", variant: "warning" },
    "deactivate-user-role": { label: "Deactivate User", variant: "warning" },
  };
  const fc = footerConfig[kind] || { label: "OK", variant: "primary" };
  const footer = (<><Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button><Button type="button" variant={fc.variant} onClick={submitMap[kind]} loading={isBusy}>{fc.label}</Button></>);
  const isRoleForm = kind === "add-role" || kind === "edit-role";
  const isUserRoleForm = kind === "add-user-role" || kind === "edit-user-role";

  const getUserLabel = (user) => {
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    return fullName ? `${fullName} (${user?.username || ""})` : (user?.username || "Unknown");
  };

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} footer={footer}>
      {isRoleForm ? (
        <div className="d-flex flex-column gap-3">
          <div><label className="form-label mb-1">Org Role Name</label><Input value={roleDraft.name} onChange={(e) => setRoleDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter org role name" autoFocus /></div>
          <div><label className="form-label mb-1">Description</label><Input as="textarea" rows={3} value={roleDraft.desc} onChange={(e) => setRoleDraft((p) => ({ ...p, desc: e.target.value }))} placeholder="Enter org role description" /></div>
        </div>
      ) : null}
      {isUserRoleForm ? (
        <div className="d-flex flex-column gap-3">
          {kind === "add-user-role" ? <div className="small text-muted">Adding user for <strong>{dialog?.target?.role_name || selectedRole?.ref_name || "selected org role"}</strong></div> : null}
          <div>
            <label className="form-label mb-1">User</label>
            <select className="form-select form-select-sm" value={userRoleDraft.userId} onChange={(e) => setUserRoleDraft((p) => ({ ...p, userId: e.target.value }))} disabled={isBusy}>
              <option value="">-- Select User --</option>
              {userOptions.map((u) => (
                <option key={u.user_id} value={u.user_id}>{getUserLabel(u)}</option>
              ))}
            </select>
          </div>
          <div className="form-check">
            <input type="checkbox" className="form-check-input" id="uor-primary" checked={userRoleDraft.isPrimary} onChange={(e) => setUserRoleDraft((p) => ({ ...p, isPrimary: e.target.checked }))} disabled={isBusy} />
            <label className="form-check-label small" htmlFor="uor-primary">Primary</label>
          </div>
          <div className="form-check">
            <input type="checkbox" className="form-check-input" id="uor-active" checked={userRoleDraft.isActive} onChange={(e) => setUserRoleDraft((p) => ({ ...p, isActive: e.target.checked }))} disabled={isBusy} />
            <label className="form-check-label small" htmlFor="uor-active">Active</label>
          </div>
        </div>
      ) : null}
      {kind === "toggle-role" ? <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} org role <strong>{dialog?.target?.ref_name || ""}</strong>?</p> : null}
      {kind === "toggle-user-role" ? <p className="mb-0">{dialog?.nextIsActive ? "Enable" : "Disable"} user for <strong>{dialog?.target?.role_name || selectedRole?.ref_name || "org role"}</strong>?</p> : null}
      {kind === "deactivate-role" ? <p className="mb-0 text-danger">Deactivate org role <strong>{dialog?.target?.ref_name || ""}</strong> and all its users in charge?</p> : null}
      {kind === "deactivate-user-role" ? <p className="mb-0 text-danger">Deactivate this user for <strong>{dialog?.target?.role_name || selectedRole?.ref_name || "org role"}</strong>?</p> : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function OrgRoleSetupView({ orgRoles = [], userOrgRoles = [], users = [], embedded = false }) {
  const h = useOrgRoleSetup({ orgRoles, userOrgRoles, users });

  const content = (
    <>
      <OrgRoleHeader
        hasPendingChanges={h.hasPendingChanges} pendingSummary={h.pendingSummary}
        isSavingBatch={h.isSavingBatch} isMutatingAction={h.isMutatingAction}
        handleSaveBatch={h.handleSaveBatch} handleCancelBatch={h.handleCancelBatch}
        openAddRoleDialog={h.openAddRoleDialog}
      />

      <OrgRoleTable
        decoratedRoles={h.decoratedRoles} decoratedSelectedRoleUserRoles={h.decoratedSelectedRoleUserRoles}
        selectedRole={h.selectedRole} expandedRoleId={h.expandedRoleId}
        isMutatingAction={h.isMutatingAction} isSavingBatch={h.isSavingBatch}
        pendingDeactivatedRoleIds={h.pendingDeactivatedRoleIds} pendingDeactivatedUserRoleIds={h.pendingDeactivatedUserRoleIds}
        handleRoleRowClick={h.handleRoleRowClick}
        editingRoleId={h.editingRoleId} onStartEditingRole={h.startEditingRole} onStopEditingRole={h.stopEditingRole}
        onInlineEditRole={h.handleInlineEditRole}
        openToggleRoleDialog={h.openToggleRoleDialog} openDeactivateRoleDialog={h.openDeactivateRoleDialog}
        stageHardDeleteRole={h.stageHardDeleteRole} onUndoBatchActionRole={h.unstageHardDeleteRole}
        openAddUserRoleDialog={h.openAddUserRoleDialog}
        editingUserRoleId={h.editingUserRoleId} onStartEditingUserRole={h.startEditingUserRole} onStopEditingUserRole={h.stopEditingUserRole}
        openEditUserRoleDialog={h.openEditUserRoleDialog} openToggleUserRoleDialog={h.openToggleUserRoleDialog}
        openDeactivateUserRoleDialog={h.openDeactivateUserRoleDialog}
        stageHardDeleteUserRole={h.stageHardDeleteUserRole} onUndoBatchActionUserRole={h.unstageHardDeleteUserRole}
        userOptions={h.userOptions}
      />

      <OrgRoleDialog
        dialog={h.dialog} roleDraft={h.roleDraft} userRoleDraft={h.userRoleDraft}
        isMutatingAction={h.isMutatingAction} isSavingBatch={h.isSavingBatch}
        setRoleDraft={h.setRoleDraft} setUserRoleDraft={h.setUserRoleDraft}
        closeDialog={h.closeDialog}
        submitAddRole={h.submitAddRole} submitEditRole={h.submitEditRole}
        submitToggleRole={h.submitToggleRole} submitDeactivateRole={h.submitDeactivateRole}
        submitAddUserRole={h.submitAddUserRole} submitEditUserRole={h.submitEditUserRole}
        submitToggleUserRole={h.submitToggleUserRole} submitDeactivateUserRole={h.submitDeactivateUserRole}
        userOptions={h.userOptions} selectedRole={h.selectedRole}
      />
    </>
  );

  if (embedded) return content;

  return (
    <main className="container-fluid py-4">
      <div className="d-flex align-items-center mb-3">
        <div>
          <h1 className="h3 mb-0">Org Roles</h1>
          <p className="text-muted mb-0">Manage organizational roles and their users in charge.</p>
        </div>
      </div>
      {content}
    </main>
  );
}