"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import {
  parseId, isSameId, compareText, buildOrderSignature,
  mapGroupRow, mapCardRow, removeObjectKey, mergeUpdatePatch, appendUniqueId,
  EMPTY_DIALOG, TEMP_GROUP_PREFIX, TEMP_CARD_PREFIX, createTempId,
  isTempGroupId, isTempCardId, createEmptyBatchState, executeBatchSave,
} from "../data/cardModuleSetup.data.js";
import { loadCardRoleAccessByApp } from "../data/cardModuleSetup.actions.js";

// ─── BATCH MARKER HELPER ────────────────────────────────────

function batchMarker(bs) {
  const map = {
    hardDeleted: { t: "Deleted", c: "psb-batch-marker psb-batch-marker-deleted" },
    deleted: { t: "Deactivated", c: "psb-batch-marker psb-batch-marker-deleted" },
    created: { t: "New", c: "psb-batch-marker psb-batch-marker-new" },
    updated: { t: "Edited", c: "psb-batch-marker psb-batch-marker-edited" },
    reordered: { t: "Reordered", c: "psb-batch-marker psb-batch-marker-reordered" },
  };
  return map[bs] || { t: "", c: "" };
}

// ─── HOOK: useGroupActions ─────────────────────────────────

function useGroupActions({
  isSaving, isMutatingAction, selectedApp, appGroups, allCards, orderedGroups,
  pendingDeactivatedGroupIds, dialog, groupDraft,
  setOrderedGroups, setAllCards, setPendingBatch, setDialog, setGroupDraft,
}) {
  const openAddGroupDialog = useCallback(() => {
    if (isSaving || isMutatingAction) return;
    if (!selectedApp?.app_id) { toastError("Select an application first."); return; }
    setGroupDraft({ name: "", desc: "", icon: "" });
    setDialog({ kind: "add-group", target: { app_id: selectedApp.app_id }, nextIsActive: true });
  }, [isMutatingAction, isSaving, selectedApp, setDialog, setGroupDraft]);

  const submitAddGroup = useCallback(() => {
    const groupName = String(groupDraft.name || "").trim();
    if (!groupName) { toastError("Group name is required."); return; }
    const groupDesc = String(groupDraft.desc || "").trim();
    const groupIcon = String(groupDraft.icon || "").trim() || "layer-group";
    const tempGroupId = createTempId(TEMP_GROUP_PREFIX);
    setOrderedGroups((prev) => [...prev, mapGroupRow({
      group_id: tempGroupId, app_id: selectedApp?.app_id, group_name: groupName,
      group_desc: groupDesc, icon: groupIcon, is_active: true, display_order: appGroups.length + 1,
    }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, groupCreates: [...prev.groupCreates, {
      tempId: tempGroupId, payload: { app_id: selectedApp?.app_id, group_name: groupName, group_desc: groupDesc, icon: groupIcon, is_active: true },
    }]}));
    setDialog(EMPTY_DIALOG); setGroupDraft({ name: "", desc: "", icon: "" });
    toastSuccess("Card group staged for Save Batch.", "Batching");
  }, [appGroups.length, groupDraft, selectedApp, setDialog, setGroupDraft, setOrderedGroups, setPendingBatch]);

  const submitEditGroup = useCallback(() => {
    const row = dialog?.target;
    if (!row?.group_id) { toastError("Invalid card group."); return; }
    const groupName = String(groupDraft.name || "").trim();
    if (!groupName) { toastError("Group name is required."); return; }
    const groupDesc = String(groupDraft.desc || "").trim();
    const groupIcon = String(groupDraft.icon || "").trim() || "layer-group";
    const groupId = row.group_id;
    setOrderedGroups((prev) => prev.map((g, i) => isSameId(g?.group_id, groupId)
      ? mapGroupRow({ ...g, group_name: groupName, group_desc: groupDesc, icon: groupIcon }, i) : g));
    setPendingBatch((prev) => {
      if (isTempGroupId(groupId)) {
        return { ...prev, groupCreates: prev.groupCreates.map((e) => isSameId(e?.tempId, groupId) ? { ...e, payload: { ...e.payload, group_name: groupName, group_desc: groupDesc, icon: groupIcon } } : e), groupUpdates: removeObjectKey(prev.groupUpdates, groupId) };
      }
      return { ...prev, groupUpdates: { ...prev.groupUpdates, [String(groupId)]: mergeUpdatePatch(prev.groupUpdates?.[String(groupId)], { group_name: groupName, group_desc: groupDesc, icon: groupIcon }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Card group update staged for Save Batch.", "Batching");
  }, [dialog, groupDraft, setDialog, setOrderedGroups, setPendingBatch]);

  const openEditGroupDialog = useCallback((row) => {
    if (isSaving || isMutatingAction) return;
    setGroupDraft({ name: String(row?.group_name || ""), desc: String(row?.group_desc || ""), icon: String(row?.group_icon || row?.icon || "") });
    setDialog({ kind: "edit-group", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setDialog, setGroupDraft]);

  const stageDeactivateGroup = useCallback((row) => {
    const groupId = String(row?.group_id ?? "");
    if (!groupId || isSaving || isMutatingAction) return;

    if (pendingDeactivatedGroupIds.has(groupId)) {
      const linkedCardIds = allCards.filter((c) => isSameId(c?.group_id, groupId)).map((c) => String(c?.card_id ?? ""));
      setPendingBatch((prev) => ({
        ...prev,
        groupDeactivations: (prev.groupDeactivations || []).filter((id) => !isSameId(id, groupId)),
        cardDeactivations: (prev.cardDeactivations || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
      }));
      toastSuccess("Card group deactivation un-staged.", "Batching");
      return;
    }

    const linkedCardIds = allCards.filter((c) => isSameId(c?.group_id, groupId)).map((c) => String(c?.card_id ?? ""));

    if (isTempGroupId(groupId)) {
      const nextGroups = orderedGroups.filter((g) => !isSameId(g?.group_id, groupId)).map((g, i) => ({ ...g, display_order: i + 1 }));
      setOrderedGroups(nextGroups);
      setAllCards((prev) => prev.filter((c) => !isSameId(c?.group_id, groupId)));
      setPendingBatch((prev) => ({
        ...prev, groupCreates: prev.groupCreates.filter((e) => !isSameId(e?.tempId, groupId)),
        groupUpdates: removeObjectKey(prev.groupUpdates, groupId),
        groupDeactivations: (prev.groupDeactivations || []).filter((id) => !isSameId(id, groupId)),
        cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.payload?.group_id, groupId)),
        cardUpdates: linkedCardIds.reduce((m, id) => removeObjectKey(m, id), prev.cardUpdates),
        cardDeactivations: (prev.cardDeactivations || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
      }));
      toastSuccess("Staged card group removed.", "Batching"); return;
    }

    setPendingBatch((prev) => {
      const nextCardDeactivations = linkedCardIds.reduce((ids, id) => appendUniqueId(ids, id), prev.cardDeactivations || []);
      return { ...prev, groupUpdates: removeObjectKey(prev.groupUpdates, groupId),
        groupDeactivations: appendUniqueId(prev.groupDeactivations, groupId),
        cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.payload?.group_id, groupId)),
        cardUpdates: linkedCardIds.reduce((m, id) => removeObjectKey(m, id), prev.cardUpdates),
        cardDeactivations: nextCardDeactivations,
      };
    });
    toastSuccess("Card group deactivation staged for Save Batch.", "Batching");
  }, [allCards, isMutatingAction, isSaving, orderedGroups, pendingDeactivatedGroupIds, setAllCards, setOrderedGroups, setPendingBatch]);

  const stageHardDeleteGroup = useCallback((row) => {
    const groupId = String(row?.group_id ?? "");
    if (!groupId || isSaving || isMutatingAction) return;
    const linkedCardIds = allCards.filter((c) => isSameId(c?.group_id, groupId)).map((c) => String(c?.card_id ?? ""));

    if (isTempGroupId(groupId)) {
      const nextGroups = orderedGroups.filter((g) => !isSameId(g?.group_id, groupId)).map((g, i) => ({ ...g, display_order: i + 1 }));
      setOrderedGroups(nextGroups);
      setAllCards((prev) => prev.filter((c) => !isSameId(c?.group_id, groupId)));
      setPendingBatch((prev) => ({
        ...prev, groupCreates: prev.groupCreates.filter((e) => !isSameId(e?.tempId, groupId)),
        groupUpdates: removeObjectKey(prev.groupUpdates, groupId),
        cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.payload?.group_id, groupId)),
        cardUpdates: linkedCardIds.reduce((m, id) => removeObjectKey(m, id), prev.cardUpdates),
        cardDeactivations: (prev.cardDeactivations || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
        cardHardDeletes: (prev.cardHardDeletes || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
      }));
      toastSuccess("Staged card group removed.", "Batching"); return;
    }

    setPendingBatch((prev) => ({
      ...prev, groupUpdates: removeObjectKey(prev.groupUpdates, groupId),
      groupDeactivations: (prev.groupDeactivations || []).filter((id) => !isSameId(id, groupId)),
      groupHardDeletes: appendUniqueId(prev.groupHardDeletes || [], groupId),
      cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.payload?.group_id, groupId)),
      cardUpdates: linkedCardIds.reduce((m, id) => removeObjectKey(m, id), prev.cardUpdates),
      cardDeactivations: (prev.cardDeactivations || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
      cardHardDeletes: linkedCardIds.reduce(
        (ids, id) => isTempCardId(id) ? ids : appendUniqueId(ids, id),
        (prev.cardHardDeletes || []).filter((id) => !linkedCardIds.some((lr) => isSameId(lr, id))),
      ),
    }));
    toastSuccess("Card group deletion staged for Save Batch.", "Batching");
  }, [allCards, isMutatingAction, isSaving, orderedGroups, setAllCards, setOrderedGroups, setPendingBatch]);

  return {
    openAddGroupDialog, openEditGroupDialog, submitAddGroup, submitEditGroup,
    stageDeactivateGroup, stageHardDeleteGroup,
  };
}

// ─── HOOK: useCardActions ──────────────────────────────────

function useCardActions({
  isSaving, isMutatingAction, selectedApp, allCards, pendingDeactivatedCardIds,
  dialog, cardDraft, setAllCards, setPendingBatch, setDialog, setCardDraft,
}) {
  const openAddCardDialog = useCallback((groupRow) => {
    if (isSaving || isMutatingAction) return;
    if (!groupRow?.group_id) { toastError("Select a card group before adding a card."); return; }
    setCardDraft({ name: "", desc: "", route_path: "", icon: "", role_ids: [] });
    setDialog({ kind: "add-card", target: { group_id: groupRow.group_id, group_name: groupRow.group_name, app_id: selectedApp?.app_id }, nextIsActive: true });
  }, [isMutatingAction, isSaving, selectedApp, setCardDraft, setDialog]);

  const openEditCardDialog = useCallback((row) => {
    if (isSaving || isMutatingAction) return;
    setCardDraft({ name: String(row?.card_name || ""), desc: String(row?.card_desc || ""), route_path: String(row?.route_path || ""), icon: String(row?.card_icon || row?.icon || ""), role_ids: [] });
    setDialog({ kind: "edit-card", target: row, nextIsActive: null });
  }, [isMutatingAction, isSaving, setCardDraft, setDialog]);

  const submitAddCard = useCallback(() => {
    const target = dialog?.target;
    if (!target?.group_id) { toastError("Select a card group before adding a card."); return; }
    const cardName = String(cardDraft.name || "").trim();
    if (!cardName) { toastError("Card name is required."); return; }
    const cardDesc = String(cardDraft.desc || "").trim();
    const routePath = String(cardDraft.route_path || "").trim() || "#";
    const cardIcon = String(cardDraft.icon || "").trim() || "table-cells-large";
    const tempCardId = createTempId(TEMP_CARD_PREFIX);
    const groupCards = allCards.filter((c) => isSameId(c?.group_id, target.group_id));
    setAllCards((prev) => [...prev, mapCardRow({
      card_id: tempCardId, group_id: target.group_id, app_id: target.app_id,
      card_name: cardName, card_desc: cardDesc, route_path: routePath, icon: cardIcon,
      is_active: true, display_order: groupCards.length + 1,
    }, prev.length)]);
    setPendingBatch((prev) => ({ ...prev, cardCreates: [...prev.cardCreates, {
      tempId: tempCardId, payload: { group_id: target.group_id, app_id: target.app_id, card_name: cardName, card_desc: cardDesc, route_path: routePath, icon: cardIcon, is_active: true },
    }],
      roleAccessAdds: [...(prev.roleAccessAdds || []), ...(cardDraft.role_ids || []).map((rid) => ({ card_id: String(tempCardId), role_id: String(rid) }))],
    }));
    setDialog(EMPTY_DIALOG); setCardDraft({ name: "", desc: "", route_path: "", icon: "", role_ids: [] });
    toastSuccess("Card staged for Save Batch.", "Batching");
  }, [allCards, cardDraft, dialog, setAllCards, setCardDraft, setDialog, setPendingBatch]);

  const submitEditCard = useCallback(() => {
    const row = dialog?.target;
    if (!row?.card_id) { toastError("Invalid card."); return; }
    const cardName = String(cardDraft.name || "").trim();
    if (!cardName) { toastError("Card name is required."); return; }
    const cardDesc = String(cardDraft.desc || "").trim();
    const routePath = String(cardDraft.route_path || "").trim() || "#";
    const cardIcon = String(cardDraft.icon || "").trim() || "table-cells-large";
    const cardId = row.card_id;
    setAllCards((prev) => prev.map((c, i) => isSameId(c?.card_id, cardId) ? mapCardRow({ ...c, card_name: cardName, card_desc: cardDesc, route_path: routePath, icon: cardIcon }, i) : c));
    setPendingBatch((prev) => {
      if (isTempCardId(cardId)) {
        return { ...prev, cardCreates: prev.cardCreates.map((e) => isSameId(e?.tempId, cardId) ? { ...e, payload: { ...e.payload, card_name: cardName, card_desc: cardDesc, route_path: routePath, icon: cardIcon } } : e), cardUpdates: removeObjectKey(prev.cardUpdates, cardId) };
      }
      return { ...prev, cardUpdates: { ...prev.cardUpdates, [String(cardId)]: mergeUpdatePatch(prev.cardUpdates?.[String(cardId)], { card_name: cardName, card_desc: cardDesc, route_path: routePath, icon: cardIcon }) } };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess("Card update staged for Save Batch.", "Batching");
  }, [cardDraft, dialog, setAllCards, setDialog, setPendingBatch]);

  const stageDeactivateCard = useCallback((row) => {
    const cardId = String(row?.card_id ?? "");
    if (!cardId || isSaving || isMutatingAction) return;

    if (pendingDeactivatedCardIds.has(cardId)) {
      setPendingBatch((prev) => ({ ...prev, cardDeactivations: (prev.cardDeactivations || []).filter((id) => !isSameId(id, cardId)) }));
      toastSuccess("Card deactivation un-staged.", "Batching"); return;
    }

    if (isTempCardId(cardId)) {
      setAllCards((items) => items.filter((c) => !isSameId(c?.card_id, cardId)));
      setPendingBatch((prev) => ({
        ...prev, cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.tempId, cardId)),
        cardUpdates: removeObjectKey(prev.cardUpdates, cardId),
      }));
      toastSuccess("Staged card removed.", "Batching"); return;
    }

    setPendingBatch((prev) => ({
      ...prev, cardUpdates: removeObjectKey(prev.cardUpdates, cardId),
      cardDeactivations: appendUniqueId(prev.cardDeactivations, cardId),
    }));
    toastSuccess("Card deactivation staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSaving, pendingDeactivatedCardIds, setAllCards, setPendingBatch]);

  const stageHardDeleteCard = useCallback((row) => {
    const cardId = String(row?.card_id ?? "");
    if (!cardId || isSaving || isMutatingAction) return;
    if (isTempCardId(cardId)) {
      setAllCards((prev) => prev.filter((c) => !isSameId(c?.card_id, cardId)));
      setPendingBatch((prev) => ({ ...prev, cardCreates: prev.cardCreates.filter((e) => !isSameId(e?.tempId, cardId)), cardUpdates: removeObjectKey(prev.cardUpdates, cardId) }));
      toastSuccess("Staged card removed.", "Batching"); return;
    }
    setPendingBatch((prev) => ({
      ...prev, cardDeactivations: (prev.cardDeactivations || []).filter((id) => !isSameId(id, cardId)),
      cardUpdates: removeObjectKey(prev.cardUpdates, cardId), cardHardDeletes: appendUniqueId(prev.cardHardDeletes || [], cardId),
    }));
    toastSuccess("Card deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSaving, setAllCards, setPendingBatch]);

  return {
    openAddCardDialog, openEditCardDialog, submitAddCard, submitEditCard,
    stageDeactivateCard, stageHardDeleteCard,
  };
}

// ─── HOOK: useCardModuleSetup ──────────────────────────────

function useCardModuleSetup({ applications = [], cardGroups = [], cards = [], initialSelectedAppId = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const safeApplications = useMemo(() => Array.isArray(applications) ? applications : [], [applications]);

  const seedCardGroups = useMemo(() =>
    (Array.isArray(cardGroups) ? cardGroups : []).map((g, i) => mapGroupRow(g, i))
      .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.group_name, b.group_name); }),
    [cardGroups]);

  const seedCards = useMemo(() =>
    (Array.isArray(cards) ? cards : []).map((c, i) => mapCardRow(c, i))
      .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.card_name, b.card_name); }),
    [cards]);

  const initialAppId = useMemo(() => {
    if (initialSelectedAppId != null && initialSelectedAppId !== "") return initialSelectedAppId;
    return safeApplications[0]?.app_id ?? null;
  }, [initialSelectedAppId, safeApplications]);

  function buildCardSigMap(groups, cardList) {
    const m = {};
    for (const g of groups) {
      const gid = String(g?.group_id ?? "");
      const gc = cardList.filter((c) => isSameId(c?.group_id, g?.group_id))
        .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.card_name, b.card_name); });
      m[gid] = buildOrderSignature(gc, "card_id");
    }
    return m;
  }

  // ── State ──
  const [orderedGroups, setOrderedGroups] = useState(seedCardGroups);
  const [allCards, setAllCards] = useState(seedCards);
  const [roleAccess, setRoleAccess] = useState([]);
  const [roles, setRoles] = useState([]);
  const [persistedGroupOrderSig, setPersistedGroupOrderSig] = useState(() =>
    buildOrderSignature(seedCardGroups.filter((g) => isSameId(g?.app_id, initialAppId)), "group_id"));
  const [persistedCardOrderSigs, setPersistedCardOrderSigs] = useState(() =>
    buildCardSigMap(seedCardGroups.filter((g) => isSameId(g?.app_id, initialAppId)), seedCards));
  const [isSaving, setIsSaving] = useState(false);
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [pendingBatch, setPendingBatch] = useState(createEmptyBatchState());
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [groupDraft, setGroupDraft] = useState({ name: "", desc: "", icon: "" });
  const [cardDraft, setCardDraft] = useState({ name: "", desc: "", route_path: "", icon: "", role_ids: [] });
  const [expandedGroupId, setExpandedGroupId] = useState(null);
  const [expandedCardId, setExpandedCardId] = useState(null);
  const [roleAccessVersion, setRoleAccessVersion] = useState(0);
  const batchActiveRef = useRef(false);

  // ── Load role access when app changes ──
  const selectedAppId = useMemo(() => {
    const fromQ = parseId(searchParams?.get("app"));
    if (fromQ !== null) return fromQ;
    if (initialSelectedAppId != null && initialSelectedAppId !== "") return initialSelectedAppId;
    return safeApplications[0]?.app_id ?? null;
  }, [initialSelectedAppId, safeApplications, searchParams]);

  const selectedApp = useMemo(
    () => safeApplications.find((a) => isSameId(a?.app_id, selectedAppId)) ?? safeApplications[0] ?? null,
    [safeApplications, selectedAppId]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedApp?.app_id) return;
    loadCardRoleAccessByApp(selectedApp.app_id).then((result) => {
      if (cancelled) return;
      setRoleAccess(result.roleAccess || []);
      setRoles(result.roles || []);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedApp?.app_id, roleAccessVersion]);

  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedGroups(seedCardGroups); setAllCards(seedCards);
    const resetGroups = seedCardGroups.filter((g) => isSameId(g?.app_id, initialAppId));
    setPersistedGroupOrderSig(buildOrderSignature(resetGroups, "group_id"));
    setPersistedCardOrderSigs(buildCardSigMap(resetGroups, seedCards));
    setIsSaving(false); setIsMutatingAction(false);
    setPendingBatch(createEmptyBatchState()); setDialog(EMPTY_DIALOG);
    setGroupDraft({ name: "", desc: "", icon: "" }); setCardDraft({ name: "", desc: "", route_path: "", icon: "", role_ids: [] });
    setExpandedGroupId(null); setExpandedCardId(null);
  }, [seedCardGroups, seedCards, initialAppId]);

  const appGroups = useMemo(
    () => orderedGroups.filter((g) => isSameId(g?.app_id, selectedApp?.app_id)),
    [orderedGroups, selectedApp?.app_id]);

  const excludedGroupIds = useMemo(() => new Set([
    ...(pendingBatch.groupCreates || []).map((e) => String(e?.tempId ?? "")),
    ...(pendingBatch.groupDeactivations || []).map((id) => String(id ?? "")),
    ...(pendingBatch.groupHardDeletes || []).map((id) => String(id ?? "")),
  ]), [pendingBatch.groupCreates, pendingBatch.groupDeactivations, pendingBatch.groupHardDeletes]);

  const excludedCardIds = useMemo(() => new Set([
    ...(pendingBatch.cardCreates || []).map((e) => String(e?.tempId ?? "")),
    ...(pendingBatch.cardDeactivations || []).map((id) => String(id ?? "")),
    ...(pendingBatch.cardHardDeletes || []).map((id) => String(id ?? "")),
  ]), [pendingBatch.cardCreates, pendingBatch.cardDeactivations, pendingBatch.cardHardDeletes]);

  const currentGroupOrderSig = useMemo(
    () => buildOrderSignature(appGroups.filter((g) => !excludedGroupIds.has(String(g?.group_id ?? ""))), "group_id"),
    [appGroups, excludedGroupIds]);
  const persistedGroupOrderSigFiltered = useMemo(() => {
    const deactivatedOrDeleted = new Set([
      ...(pendingBatch.groupDeactivations || []).map((id) => String(id ?? "")),
      ...(pendingBatch.groupHardDeletes || []).map((id) => String(id ?? "")),
    ]);
    const base = seedCardGroups.filter((g) => isSameId(g?.app_id, selectedApp?.app_id) && !deactivatedOrDeleted.has(String(g?.group_id ?? "")));
    return buildOrderSignature(base, "group_id");
  }, [seedCardGroups, selectedApp?.app_id, pendingBatch.groupDeactivations, pendingBatch.groupHardDeletes]);
  const hasGroupOrderChanges = persistedGroupOrderSigFiltered !== currentGroupOrderSig;

  const hasCardOrderChanges = useMemo(() => {
    for (const g of appGroups) {
      const gid = String(g?.group_id ?? "");
      if (excludedGroupIds.has(gid)) continue;
      const gc = allCards.filter((c) => isSameId(c?.group_id, g?.group_id) && !excludedCardIds.has(String(c?.card_id ?? "")))
        .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.card_name, b.card_name); });
      const persistedSig = persistedCardOrderSigs[gid] ?? "";
      const persistedFiltered = persistedSig.split("|").filter((id) => !excludedCardIds.has(id)).join("|");
      if (buildOrderSignature(gc, "card_id") !== persistedFiltered) return true;
    }
    return false;
  }, [allCards, appGroups, excludedCardIds, excludedGroupIds, persistedCardOrderSigs]);

  const pendingSummary = useMemo(() => {
    const gA = pendingBatch.groupCreates.length;
    const gE = Object.entries(pendingBatch.groupUpdates || {}).filter(([id, patch]) => {
      const seed = seedCardGroups.find((g) => isSameId(g?.group_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const gD = pendingBatch.groupDeactivations.length, gH = (pendingBatch.groupHardDeletes || []).length;
    const cA = pendingBatch.cardCreates.length;
    const cE = Object.entries(pendingBatch.cardUpdates || {}).filter(([id, patch]) => {
      const seed = seedCards.find((c) => isSameId(c?.card_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).length;
    const cD = pendingBatch.cardDeactivations.length, cH = (pendingBatch.cardHardDeletes || []).length;
    const rA = (pendingBatch.roleAccessAdds || []).length, rR = (pendingBatch.roleAccessRemoves || []).length;
    const oC = (hasGroupOrderChanges ? 1 : 0) + (hasCardOrderChanges ? 1 : 0);
    return { groupAdded: gA, groupEdited: gE, groupDeactivated: gD, groupHardDeleted: gH, cardAdded: cA, cardEdited: cE, cardDeactivated: cD, cardHardDeleted: cH, roleAdded: rA, roleRemoved: rR, rowOrderChanged: oC, total: gA + gE + gD + gH + cA + cE + cD + cH + rA + rR + oC };
  }, [hasCardOrderChanges, hasGroupOrderChanges, pendingBatch, seedCardGroups, seedCards]);

  const hasPendingChanges = pendingSummary.total > 0;
  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedGroupIds = useMemo(() => new Set((pendingBatch.groupDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.groupDeactivations]);
  const pendingDeactivatedCardIds = useMemo(() => new Set((pendingBatch.cardDeactivations || []).map((id) => String(id ?? ""))), [pendingBatch.cardDeactivations]);

  // ── Decorated rows ──
  const decoratedGroups = useMemo(() => {
    const cIds = new Set((pendingBatch.groupCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.groupUpdates || {}).filter(([id, patch]) => {
      const seed = seedCardGroups.find((g) => isSameId(g?.group_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.groupDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.groupHardDeletes || []).map((e) => String(e ?? "")));
    return appGroups.map((row) => {
      const id = String(row?.group_id ?? "");
      const oc = row.__originalOrder != null && Number(row.display_order) !== Number(row.__originalOrder);
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      if (oc) return { ...row, __batchState: "reordered" };
      return { ...row, __batchState: "none" };
    });
  }, [appGroups, pendingBatch.groupCreates, pendingBatch.groupDeactivations, pendingBatch.groupHardDeletes, pendingBatch.groupUpdates, seedCardGroups]);

  const decorateCards = useCallback((groupId) => {
    const groupCards = allCards.filter((c) => isSameId(c?.group_id, groupId))
      .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.card_name, b.card_name); });
    const cIds = new Set((pendingBatch.cardCreates || []).map((e) => String(e?.tempId ?? "")));
    const uIds = new Set(Object.entries(pendingBatch.cardUpdates || {}).filter(([id, patch]) => {
      const seed = seedCards.find((c) => isSameId(c?.card_id, id));
      if (!seed) return true;
      return Object.entries(patch || {}).some(([k, v]) => String(v ?? "") !== String(seed[k] ?? ""));
    }).map(([id]) => id));
    const dIds = new Set((pendingBatch.cardDeactivations || []).map((e) => String(e ?? "")));
    const hIds = new Set((pendingBatch.cardHardDeletes || []).map((e) => String(e ?? "")));
    return groupCards.map((row) => {
      const id = String(row?.card_id ?? "");
      if (hIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (dIds.has(id)) return { ...row, __batchState: "deleted" };
      if (cIds.has(id)) return { ...row, __batchState: "created" };
      if (uIds.has(id)) return { ...row, __batchState: "updated" };
      return { ...row, __batchState: "none" };
    });
  }, [allCards, pendingBatch.cardCreates, pendingBatch.cardDeactivations, pendingBatch.cardHardDeletes, pendingBatch.cardUpdates, seedCards]);

  // ── Role access helpers ──
  const getCardRoleIds = useCallback((cardId) => {
    const persistedRoles = roleAccess
      .filter((r) => isSameId(r?.card_id, cardId) && r?.is_active)
      .map((r) => String(r?.role_id ?? ""));
    const addedRoles = (pendingBatch.roleAccessAdds || [])
      .filter((e) => isSameId(e?.card_id, cardId))
      .map((e) => String(e?.role_id ?? ""));
    const removedRoles = new Set((pendingBatch.roleAccessRemoves || [])
      .filter((e) => isSameId(e?.card_id, cardId))
      .map((e) => String(e?.role_id ?? "")));
    const combined = new Set([...persistedRoles, ...addedRoles]);
    removedRoles.forEach((id) => combined.delete(id));
    return [...combined];
  }, [pendingBatch.roleAccessAdds, pendingBatch.roleAccessRemoves, roleAccess]);

  const stageAddRoleAccess = useCallback((cardId, roleId) => {
    if (!cardId || !roleId || isSaving || isMutatingAction) return;
    setPendingBatch((prev) => {
      const alreadyRemoved = (prev.roleAccessRemoves || []).find((e) => isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId));
      if (alreadyRemoved) {
        return { ...prev, roleAccessRemoves: prev.roleAccessRemoves.filter((e) => !(isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId))) };
      }
      const alreadyAdded = (prev.roleAccessAdds || []).find((e) => isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId));
      if (alreadyAdded) return prev;
      return { ...prev, roleAccessAdds: [...(prev.roleAccessAdds || []), { card_id: String(cardId), role_id: String(roleId) }] };
    });
    toastSuccess("Role access staged.", "Batching");
  }, [isMutatingAction, isSaving]);

  const stageRemoveRoleAccess = useCallback((cardId, roleId) => {
    if (!cardId || !roleId || isSaving || isMutatingAction) return;
    setPendingBatch((prev) => {
      const wasAdded = (prev.roleAccessAdds || []).find((e) => isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId));
      if (wasAdded) {
        return { ...prev, roleAccessAdds: prev.roleAccessAdds.filter((e) => !(isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId))) };
      }
      const alreadyRemoved = (prev.roleAccessRemoves || []).find((e) => isSameId(e?.card_id, cardId) && isSameId(e?.role_id, roleId));
      if (alreadyRemoved) return prev;
      return { ...prev, roleAccessRemoves: [...(prev.roleAccessRemoves || []), { card_id: String(cardId), role_id: String(roleId) }] };
    });
    toastSuccess("Role removal staged.", "Batching");
  }, [isMutatingAction, isSaving]);

  // ── URL & navigation ──
  const updateQueryParams = useCallback((updates) => {
    const p = new URLSearchParams(searchParams?.toString() || "");
    Object.entries(updates).forEach(([k, v]) => { if (v == null || v === "") p.delete(k); else p.set(k, String(v)); });
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const handleApplicationChange = useCallback((appId) => {
    const nextGroups = orderedGroups.filter((g) => isSameId(g?.app_id, appId));
    setPersistedGroupOrderSig(buildOrderSignature(nextGroups, "group_id"));
    setPersistedCardOrderSigs(buildCardSigMap(nextGroups, allCards));
    setExpandedGroupId(null); setExpandedCardId(null);
    updateQueryParams({ app: appId });
  }, [allCards, orderedGroups, updateQueryParams]);

  // ── Batch operations ──
  const handleCancelBatch = useCallback(() => {
    if (isSaving || isMutatingAction) return;
    batchActiveRef.current = false;
    setOrderedGroups(seedCardGroups); setAllCards(seedCards); setPendingBatch(createEmptyBatchState());
    const cancelGroups = seedCardGroups.filter((g) => isSameId(g?.app_id, selectedApp?.app_id));
    setPersistedGroupOrderSig(buildOrderSignature(cancelGroups, "group_id"));
    setPersistedCardOrderSigs(buildCardSigMap(cancelGroups, seedCards));
    setDialog(EMPTY_DIALOG); setGroupDraft({ name: "", desc: "", icon: "" }); setCardDraft({ name: "", desc: "", route_path: "", icon: "", role_ids: [] });
    setExpandedGroupId(null); setExpandedCardId(null);
  }, [isMutatingAction, isSaving, seedCardGroups, seedCards, selectedApp?.app_id]);

  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSaving || isMutatingAction) return;
    setIsSaving(true); setIsMutatingAction(true);
    try {
      await executeBatchSave(pendingBatch, appGroups, allCards, persistedCardOrderSigs);
      setPersistedGroupOrderSig(currentGroupOrderSig);
      const nextSigMap = {};
      for (const g of appGroups) {
        const gid = String(g?.group_id ?? "");
        const gc = allCards.filter((c) => isSameId(c?.group_id, g?.group_id))
          .sort((a, b) => { const d = Number(a.display_order || 0) - Number(b.display_order || 0); return d !== 0 ? d : compareText(a.card_name, b.card_name); });
        nextSigMap[gid] = buildOrderSignature(gc, "card_id");
      }
      setPersistedCardOrderSigs(nextSigMap); setPendingBatch(createEmptyBatchState());
      batchActiveRef.current = false;
      setRoleAccessVersion((v) => v + 1);
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally { setIsMutatingAction(false); setIsSaving(false); }
  }, [allCards, appGroups, currentGroupOrderSig, hasPendingChanges, isMutatingAction, isSaving,
    pendingBatch, pendingSummary.total, persistedCardOrderSigs, router]);

  const closeDialog = useCallback(() => { if (!isMutatingAction) setDialog(EMPTY_DIALOG); }, [isMutatingAction]);

  const groupActions = useGroupActions({
    isSaving, isMutatingAction, selectedApp, appGroups, allCards, orderedGroups,
    pendingDeactivatedGroupIds, dialog, groupDraft,
    setOrderedGroups, setAllCards, setPendingBatch, setDialog, setGroupDraft,
  });

  const cardActions = useCardActions({
    isSaving, isMutatingAction, selectedApp, allCards, pendingDeactivatedCardIds,
    dialog, cardDraft, setAllCards, setPendingBatch, setDialog, setCardDraft,
  });

  const handleReorderGroups = useCallback((nextRows) => {
    if (isSaving || isMutatingAction) return;
    const appId = selectedApp?.app_id;
    setOrderedGroups((prev) => {
      const others = prev.filter((g) => !isSameId(g?.app_id, appId));
      const reordered = (Array.isArray(nextRows) ? nextRows : []).map((g, i) => ({ ...g, display_order: i + 1 }));
      return [...others, ...reordered];
    });
  }, [isMutatingAction, isSaving, selectedApp?.app_id]);

  const handleReorderCards = useCallback((nextRows, groupId) => {
    if (isSaving || isMutatingAction) return;
    setAllCards((prev) => {
      const others = prev.filter((c) => !isSameId(c?.group_id, groupId));
      const reordered = (Array.isArray(nextRows) ? nextRows : []).map((c, i) => ({ ...c, display_order: i + 1 }));
      return [...others, ...reordered];
    });
  }, [isMutatingAction, isSaving]);

  return {
    safeApplications, decoratedGroups, decorateCards,
    dialog, groupDraft, cardDraft, isSaving, isMutatingAction,
    pendingSummary, hasPendingChanges,
    pendingDeactivatedGroupIds, pendingDeactivatedCardIds,
    selectedApp, expandedGroupId, setExpandedGroupId, expandedCardId, setExpandedCardId,
    setDialog, setGroupDraft, setCardDraft,
    handleApplicationChange, handleCancelBatch, handleSaveBatch, closeDialog,
    handleReorderGroups, handleReorderCards,
    roles, getCardRoleIds, stageAddRoleAccess, stageRemoveRoleAccess,
    ...groupActions, ...cardActions,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

// ── Application Side Nav ──

function AppSideNav({ safeApplications, selectedApp, isSaving, isMutatingAction, handleApplicationChange }) {
  return (
    <aside className="setup-side-nav" aria-label="Application list">
      <p className="setup-side-nav-label">APPLICATIONS</p>
      {safeApplications.length === 0 ? (
        <div className="text-muted small p-2">No applications available.</div>
      ) : (
        <div className="setup-side-nav-list">
          {safeApplications.map((app) => {
            const isActive = isSameId(app?.app_id, selectedApp?.app_id);
            return (
              <button key={app.app_id} type="button"
                className={`setup-side-nav-item${isActive ? " is-active" : ""}`}
                disabled={isSaving || isMutatingAction}
                onClick={() => handleApplicationChange(app.app_id)}>
                <span className="setup-side-nav-item-main">
                  <span className="setup-side-nav-item-title">{app?.app_name || app?.name || "--"}</span>
                  <span className="setup-side-nav-item-meta">Order {app?.display_order ?? app?.app_order ?? "--"} – Active application</span>
                </span>
                <span className="setup-side-nav-item-end">
                  <i className="fa-solid fa-chevron-right fa-xs" aria-hidden="true" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

// ── Content Pane (groups TableZ with renderDetail → cards TableZ) ──

function ContentPane({ h }) {
  const { selectedApp, decoratedGroups, decorateCards, expandedGroupId, setExpandedGroupId,
    isSaving, isMutatingAction, hasPendingChanges, pendingSummary, pendingDeactivatedGroupIds, pendingDeactivatedCardIds,
    roles, getCardRoleIds, handleSaveBatch, handleCancelBatch,
    handleReorderGroups, handleReorderCards,
    openAddGroupDialog, openEditGroupDialog, stageHardDeleteGroup,
    openAddCardDialog, openEditCardDialog, stageHardDeleteCard } = h;

  // ── Group columns ──
  const groupColumns = useMemo(() => [
    { key: "group_name", label: "Group Name", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || "");
      return <span><strong>{row?.group_name || "--"}</strong>{m.t ? <> <span className={m.c}>{m.t}</span></> : null}{row?.group_desc ? <span className="d-block text-muted" style={{ fontSize: "0.75rem" }}>{row.group_desc}</span> : null}</span>;
    }},
    { key: "is_active_bool", label: "Active", width: 90, sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], []);

  const groupTableActions = useMemo(() => [
    { key: "edit-group", label: "Edit", icon: "pen", type: "secondary", disabled: () => isSaving || isMutatingAction, onClick: (row) => openEditGroupDialog(row) },
    { key: "add-card", label: "+ Add Card", icon: "plus", type: "success", disabled: () => isSaving || isMutatingAction, onClick: (row) => openAddCardDialog(row) },
    { key: "delete-group", label: "Delete", icon: "trash", type: "danger", disabled: () => isSaving || isMutatingAction, onClick: (row) => stageHardDeleteGroup(row) },
  ], [isMutatingAction, isSaving, openAddCardDialog, openEditGroupDialog, stageHardDeleteGroup]);

  const handleGroupRowClick = useCallback((row) => {
    const groupId = String(row?.group_id ?? "");
    setExpandedGroupId((prev) => prev === groupId ? null : groupId);
  }, [setExpandedGroupId]);

  // ── Card columns (for nested detail) ──
  const cardColumns = useMemo(() => [
    { key: "card_name", label: "Card Name", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || "");
      return <span><strong className="small">{row?.card_name || "--"}</strong>{row?.card_desc ? <span className="d-block text-muted" style={{ fontSize: "0.72rem" }}>{row.card_desc}</span> : null}{m.t ? <span className={m.c}>{m.t}</span> : null}</span>;
    }},
    { key: "route_path", label: "Route Path", sortable: true },
    { key: "roles_display", label: "Roles", render: (row) => {
      const cardId = String(row?.card_id ?? "");
      const assignedRoleIds = getCardRoleIds(cardId);
      const names = assignedRoleIds.map((rid) => {
        const role = roles.find((r) => isSameId(r?.role_id, rid));
        return role?.role_name || rid;
      });
      return names.length > 0 ? <span className="small">{names.join(", ")}</span> : <span className="text-muted small">None</span>;
    }},
    { key: "is_active_bool", label: "Active", width: 80, sortable: true, align: "center", render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} /> },
  ], [getCardRoleIds, roles]);

  const cardTableActions = useMemo(() => [
    { key: "edit-card", label: "Edit", icon: "pen", type: "secondary", disabled: () => isSaving || isMutatingAction, onClick: (row) => openEditCardDialog(row) },
    { key: "delete-card", label: "Delete", icon: "trash", type: "danger", disabled: () => isSaving || isMutatingAction, onClick: (row) => stageHardDeleteCard(row) },
  ], [isMutatingAction, isSaving, openEditCardDialog, stageHardDeleteCard]);

  // ── renderDetail for group rows ──
  const renderGroupDetail = useCallback((group) => {
    const cards = decorateCards(group?.group_id);
    const groupId = group?.group_id;
    return (
      <TableZ columns={cardColumns} data={cards} rowIdKey="card_id" actions={cardTableActions}
        draggable={!isSaving && !isMutatingAction}
        onReorder={(nextRows) => handleReorderCards(nextRows, groupId)}
        hideSearch hideFooter emptyMessage="No cards in this group." />
    );
  }, [cardColumns, cardTableActions, decorateCards, handleReorderCards, isMutatingAction, isSaving]);

  if (!selectedApp?.app_id) {
    return <div className="text-muted p-4">Select an application to manage cards and card groups.</div>;
  }

  return (
    <div className="setup-content-pane">
      <section className="setup-editor-card mb-3">
        <div className="d-flex align-items-start justify-content-between">
          <div>
            <h3 className="h5 mb-0">{selectedApp?.app_name || "Application"}</h3>
            <p className="text-muted small mb-0">Configure card groups, cards, routes, and role assignments.</p>
          </div>
        </div>
      </section>

      <section className="mb-3">
        <div className="d-flex align-items-center justify-content-between mb-2">
          <div>
            <h4 className="h6 mb-0">Card Groups</h4>
            <p className="text-muted small mb-0">Manage hierarchy for this application only.</p>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className={`small ${hasPendingChanges ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
              {isSaving ? "Saving..." : hasPendingChanges ? `${pendingSummary.total} change(s)` : "No changes"}
            </span>
            <Button type="button" size="sm" variant="primary" loading={isSaving} disabled={!hasPendingChanges || isSaving || isMutatingAction} onClick={handleSaveBatch}>Save Batch</Button>
            <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSaving || isMutatingAction} onClick={handleCancelBatch}>Cancel Batch</Button>
            <Button type="button" size="sm" variant="success" disabled={isSaving || isMutatingAction} onClick={openAddGroupDialog}>+ Add Group</Button>
          </div>
        </div>

        <TableZ columns={groupColumns} data={decoratedGroups} rowIdKey="group_id" actions={groupTableActions}
          selectedRowId={expandedGroupId} onRowClick={handleGroupRowClick}
          renderDetail={renderGroupDetail}
          draggable={!isSaving && !isMutatingAction}
          onReorder={handleReorderGroups}
          hideSearch hideFooter
          emptyMessage="No card groups for this application." />
      </section>
    </div>
  );
}

// ── Dialog ──

function CardModuleDialog({ dialog, groupDraft, cardDraft, roles, getCardRoleIds, isMutatingAction, setGroupDraft, setCardDraft, closeDialog, submitAddGroup, submitEditGroup, submitAddCard, submitEditCard, stageAddRoleAccess, stageRemoveRoleAccess }) {
  const kind = dialog?.kind;
  const dialogTitle = useMemo(() => {
    const titles = { "add-group": "Add Card Group", "edit-group": "Edit Card Group", "add-card": "Add Card", "edit-card": "Edit Card" };
    return titles[kind] || "";
  }, [kind]);

  if (!kind) return null;
  const isBusy = isMutatingAction;
  const submitMap = { "add-group": submitAddGroup, "edit-group": submitEditGroup, "add-card": submitAddCard, "edit-card": submitEditCard };
  const fc = { "add-group": { label: "Stage Group", variant: "success" }, "edit-group": { label: "Save", variant: "primary" }, "add-card": { label: "Stage Card", variant: "success" }, "edit-card": { label: "Save", variant: "primary" } }[kind] || { label: "OK", variant: "primary" };
  const footer = (<><Button type="button" variant="ghost" onClick={closeDialog} disabled={isBusy}>Cancel</Button><Button type="button" variant={fc.variant} onClick={submitMap[kind]} loading={isBusy}>{fc.label}</Button></>);
  const isGroupForm = kind === "add-group" || kind === "edit-group";
  const isCardForm = kind === "add-card" || kind === "edit-card";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} footer={footer} size={isCardForm ? "lg" : undefined}>
      {isGroupForm ? (
        <div className="d-flex flex-column gap-3">
          <div><label className="form-label mb-1">Group Name</label><Input value={groupDraft.name} onChange={(e) => setGroupDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter group name" autoFocus /></div>
          <div><label className="form-label mb-1">Description</label><Input as="textarea" rows={2} value={groupDraft.desc} onChange={(e) => setGroupDraft((p) => ({ ...p, desc: e.target.value }))} placeholder="Enter group description" /></div>
        </div>
      ) : null}
      {isCardForm ? (
        <CardFormWithRoles kind={kind} dialog={dialog} cardDraft={cardDraft} setCardDraft={setCardDraft}
          roles={roles} getCardRoleIds={getCardRoleIds}
          stageAddRoleAccess={stageAddRoleAccess} stageRemoveRoleAccess={stageRemoveRoleAccess} />
      ) : null}
    </Modal>
  );
}

// ── Card Form (with role checkboxes) ──

function CardFormWithRoles({ kind, dialog, cardDraft, setCardDraft, roles, getCardRoleIds, stageAddRoleAccess, stageRemoveRoleAccess }) {
  const cardId = dialog?.target?.card_id;
  const assignedRoleIds = useMemo(() => {
    if (!cardId) return cardDraft.role_ids || [];
    return getCardRoleIds(cardId);
  }, [cardId, cardDraft.role_ids, getCardRoleIds]);

  const handleRoleToggle = useCallback((roleId, checked) => {
    if (cardId) {
      if (checked) stageAddRoleAccess(cardId, roleId);
      else stageRemoveRoleAccess(cardId, roleId);
    } else {
      setCardDraft((p) => {
        const current = Array.isArray(p.role_ids) ? p.role_ids : [];
        const next = checked ? [...current, String(roleId)] : current.filter((id) => id !== String(roleId));
        return { ...p, role_ids: next };
      });
    }
  }, [cardId, setCardDraft, stageAddRoleAccess, stageRemoveRoleAccess]);

  return (
    <div className="d-flex flex-column gap-3">
      {kind === "add-card" ? <div className="small text-muted">Creating card for <strong>{dialog?.target?.group_name || "selected group"}</strong></div> : null}
      <div className="row g-3">
        <div className="col-6"><label className="form-label mb-1">Card Name</label><Input value={cardDraft.name} onChange={(e) => setCardDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Enter card name" autoFocus /></div>
        <div className="col-6"><label className="form-label mb-1">Description</label><Input value={cardDraft.desc} onChange={(e) => setCardDraft((p) => ({ ...p, desc: e.target.value }))} placeholder="Enter card description" /></div>
      </div>
      <div className="row g-3">
        <div className="col-6"><label className="form-label mb-1">Icon</label><Input value={cardDraft.icon} onChange={(e) => setCardDraft((p) => ({ ...p, icon: e.target.value }))} placeholder="bi-file-earmark" /></div>
        <div className="col-6"><label className="form-label mb-1">Launch URL</label><Input value={cardDraft.route_path} onChange={(e) => setCardDraft((p) => ({ ...p, route_path: e.target.value }))} placeholder="/dashboard or module:gutter/dashboard" /></div>
      </div>
      <fieldset>
        <legend className="form-label mb-1" style={{ fontSize: "0.875rem" }}>Roles</legend>
        <div className="border rounded p-2 d-flex flex-wrap gap-3">
          {roles.length === 0 ? <span className="text-muted small">No roles available.</span> : null}
          {roles.map((role) => {
            const roleId = String(role?.role_id ?? "");
            const isChecked = assignedRoleIds.includes(roleId);
            return (
              <div key={roleId} className="form-check">
                <input type="checkbox" className="form-check-input" id={`role-chk-${roleId}`}
                  checked={isChecked} onChange={(e) => handleRoleToggle(roleId, e.target.checked)} />
                <label className="form-check-label small" htmlFor={`role-chk-${roleId}`}>{role?.role_name || roleId}</label>
              </div>
            );
          })}
        </div>
        <div className="form-text">Select one or more roles for this card.</div>
      </fieldset>
    </div>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

export default function CardModuleSetupView({ applications, cardGroups, cards, initialSelectedAppId }) {
  const h = useCardModuleSetup({ applications, cardGroups, cards, initialSelectedAppId });

  return (
    <main className="container-fluid py-4">
      <div className="d-flex align-items-center mb-3">
        <div>
          <h1 className="h3 mb-0">Card Module Setup</h1>
          <p className="text-muted mb-0">Manage card groups and cards for each application.</p>
        </div>
      </div>

      <div className="setup-split-layout">
        <AppSideNav
          safeApplications={h.safeApplications} selectedApp={h.selectedApp}
          isSaving={h.isSaving} isMutatingAction={h.isMutatingAction}
          handleApplicationChange={h.handleApplicationChange}
        />
        <ContentPane h={h} />
      </div>

      <CardModuleDialog
        dialog={h.dialog} groupDraft={h.groupDraft} cardDraft={h.cardDraft}
        roles={h.roles} getCardRoleIds={h.getCardRoleIds}
        isMutatingAction={h.isMutatingAction}
        setGroupDraft={h.setGroupDraft} setCardDraft={h.setCardDraft} closeDialog={h.closeDialog}
        submitAddGroup={h.submitAddGroup} submitEditGroup={h.submitEditGroup}
        submitAddCard={h.submitAddCard} submitEditCard={h.submitEditCard}
        stageAddRoleAccess={h.stageAddRoleAccess} stageRemoveRoleAccess={h.stageRemoveRoleAccess}
      />
    </main>
  );
}
