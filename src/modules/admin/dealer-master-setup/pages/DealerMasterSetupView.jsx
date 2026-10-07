"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// ─── HOOK: useDealerMasterSetup ────────────────────────────
import { useRouter } from "next/navigation";
import { Button, Card, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import { loadUsCitiesByStateAction } from "../data/dealerMasterSetup.actions.js";
import {
  DEALER_FORM_SECTIONS,
  createEmptyDealerDraft,
  createDealerDraftFromRow,
  buildDealerPayloadFromDraft,
  isValidCreditLimit,
  isSameId,
  compareText,
  normalizeText,
  mapDealerRow,
  removeObjectKey,
  mergeUpdatePatch,
  appendUniqueId,
  EMPTY_DIALOG,
  TEMP_DEALER_PREFIX,
  createTempId,
  isTempDealerId,
  createEmptyDealerChanges,
  executeBatchSave,
} from "../data/dealerMasterSetup.data.js";

export function useDealerMasterSetup({ dealers = [], states = [] }) {
  const router = useRouter();

  const seedDealers = useMemo(
    () =>
      (Array.isArray(dealers) ? dealers : [])
        .map((dealer, index) => mapDealerRow(dealer, index))
        .sort((left, right) => compareText(left.dealer_name, right.dealer_name)),
    [dealers],
  );

  const [orderedDealers, setOrderedDealers] = useState(seedDealers);
  const [dealerChanges, setDealerChanges] = useState(createEmptyDealerChanges());
  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [dealerDraft, setDealerDraft] = useState(createEmptyDealerDraft());
  const [cityOptions, setCityOptions] = useState([]);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const batchActiveRef = useRef(false);
  const cityRequestRef = useRef(0);

  const stateOptions = useMemo(() => (Array.isArray(states) ? states : []), [states]);

  /**
   * Clears the loaded city list and invalidates any request still in
   * flight so a stale response can never repopulate it.
   */
  const resetCityOptions = useCallback(() => {
    cityRequestRef.current += 1;
    setCityOptions([]);
    setIsLoadingCities(false);
  }, []);

  // -- cascading address (State → City → ZIP)

  /**
   * Loads the cities (each with its ZIP codes) for a state.
   *
   * A request counter guards against out-of-order responses when the
   * state is changed quickly. On failure the list is emptied, which
   * makes the City and ZIP fields fall back to plain text inputs.
   */
  const loadCitiesForState = useCallback(async (stateCode) => {
    const requestId = cityRequestRef.current + 1;
    cityRequestRef.current = requestId;

    const code = normalizeText(stateCode).toUpperCase();
    if (!code) {
      setCityOptions([]);
      setIsLoadingCities(false);
      return;
    }

    setIsLoadingCities(true);
    try {
      const cities = await loadUsCitiesByStateAction(code);
      if (cityRequestRef.current !== requestId) return;
      setCityOptions(Array.isArray(cities) ? cities : []);
    } catch (error) {
      if (cityRequestRef.current !== requestId) return;
      setCityOptions([]);
      toastError(error?.message || "Failed to load cities. Type the city instead.");
    } finally {
      if (cityRequestRef.current === requestId) setIsLoadingCities(false);
    }
  }, []);

  /** Changing the state clears the city and ZIP, since they no longer apply. */
  const handleStateChange = useCallback((stateCode) => {
    setDealerDraft((prev) => ({ ...prev, state: stateCode, city: "", postal_code: "" }));
    loadCitiesForState(stateCode);
  }, [loadCitiesForState]);

  /** Changing the city resets the ZIP; a city with a single ZIP fills it in. */
  const handleCityChange = useCallback((city) => {
    const zips = cityOptions.find((entry) => entry.city === city)?.zips || [];
    setDealerDraft((prev) => ({ ...prev, city, postal_code: zips.length === 1 ? zips[0] : "" }));
  }, [cityOptions]);


  // Re-seed from the server whenever its data changes — but never while a
  // batch is pending, otherwise the user's staged work would be lost.
  useEffect(() => {
    if (batchActiveRef.current) return;
    setOrderedDealers(seedDealers);
    setDealerChanges(createEmptyDealerChanges());
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    resetCityOptions();
    setIsMutatingAction(false);
    setIsSavingBatch(false);
  }, [resetCityOptions, seedDealers]);

  // -- computed
  const pendingSummary = useMemo(() => {
    const added = dealerChanges.creates.length;
    const edited = Object.keys(dealerChanges.updates || {}).length;
    const deactivated = dealerChanges.deactivations.length;
    const hardDeleted = (dealerChanges.hardDeletes || []).length;
    return { added, edited, deactivated, hardDeleted, total: added + edited + deactivated + hardDeleted };
  }, [dealerChanges]);

  const hasPendingChanges = pendingSummary.total > 0;

  useEffect(() => { batchActiveRef.current = hasPendingChanges; }, [hasPendingChanges]);

  const pendingDeactivatedDealerIds = useMemo(
    () => new Set((dealerChanges.deactivations || []).map((id) => String(id ?? ""))),
    [dealerChanges.deactivations],
  );

  /**
   * Annotates each row with a `__batchState` so the table can show the
   * right marker (New / Edited / Deactivated / …). Staged changes win
   * over the stored values, and the checks run in priority order.
   */
  const decoratedDealers = useMemo(() => {
    const createdIds = new Set((dealerChanges.creates || []).map((entry) => String(entry?.tempId ?? "")));
    const updatesMap = dealerChanges.updates || {};
    const deactivatedIds = new Set((dealerChanges.deactivations || []).map((entry) => String(entry ?? "")));
    const hardDeletedIds = new Set((dealerChanges.hardDeletes || []).map((entry) => String(entry ?? "")));

    return orderedDealers.map((row) => {
      const id = String(row?.dealer_id ?? "");
      if (hardDeletedIds.has(id)) return { ...row, __batchState: "hardDeleted" };
      if (deactivatedIds.has(id)) return { ...row, __batchState: "deleted" };
      if (createdIds.has(id)) return { ...row, __batchState: "created" };

      const updates = updatesMap[id];
      if (updates) {
        const hasIsActive = Object.prototype.hasOwnProperty.call(updates, "is_active");
        if (hasIsActive) return { ...row, __batchState: updates.is_active ? "activated" : "deactivated" };
        return { ...row, __batchState: "updated" };
      }
      return { ...row, __batchState: "none" };
    });
  }, [dealerChanges.creates, dealerChanges.deactivations, dealerChanges.hardDeletes, dealerChanges.updates, orderedDealers]);


  // -- dialog actions

  /** Closes the modal, but never while a request is in flight. */
  const closeDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction, isSavingBatch]);

  const openAddDealerDialog = useCallback(() => {
    if (isMutatingAction || isSavingBatch) return;
    setDealerDraft(createEmptyDealerDraft());
    resetCityOptions();
    setDialog({ kind: "add-dealer", target: null, nextIsActive: true });
  }, [isMutatingAction, isSavingBatch, resetCityOptions]);

  const openEditDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const draft = createDealerDraftFromRow(row);
    setDealerDraft(draft);
    resetCityOptions();
    loadCitiesForState(draft.state);
    setDialog({ kind: "edit-dealer", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch, loadCitiesForState, resetCityOptions]);

  /**
   * Toggle is also the "undo deactivation" path: if the row is already
   * staged for deactivation, clicking it simply pulls it back out of the
   * batch instead of opening a dialog.
   */
  const openToggleDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    const dealerId = String(row?.dealer_id ?? "");
    if (pendingDeactivatedDealerIds.has(dealerId)) {
      setDealerChanges((prev) => ({
        ...prev,
        deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, dealerId)),
      }));
      toastSuccess("Dealer deactivation un-staged.", "Batching");
      return;
    }
    setDialog({ kind: "toggle-dealer", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction, isSavingBatch, pendingDeactivatedDealerIds]);

  const openDeactivateDealerDialog = useCallback((row) => {
    if (isMutatingAction || isSavingBatch) return;
    setDialog({ kind: "deactivate-dealer", target: row, nextIsActive: null });
  }, [isMutatingAction, isSavingBatch]);

  /**
   * Stages a permanent delete for Save Batch.
   *
   * A dealer that has not been saved yet is simply removed from the
   * screen and dropped from the staged creates — there is nothing in the
   * database to delete. Any staged deactivation or edit for the row is
   * discarded too, since the delete supersedes it.
   */
  const stageHardDeleteDealer = useCallback((row) => {
    const dealerId = String(row?.dealer_id ?? "");
    if (!dealerId || isMutatingAction || isSavingBatch) return;

    if (isTempDealerId(dealerId)) {
      setOrderedDealers((prev) => prev.filter((d) => !isSameId(d?.dealer_id, dealerId)));
      setDealerChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((e) => !isSameId(e?.tempId, dealerId)),
        updates: removeObjectKey(prev.updates, dealerId),
      }));
      toastSuccess("Staged dealer removed.", "Batching");
      return;
    }

    setDealerChanges((prev) => ({
      ...prev,
      deactivations: (prev.deactivations || []).filter((id) => !isSameId(id, dealerId)),
      updates: removeObjectKey(prev.updates, String(dealerId)),
      hardDeletes: appendUniqueId(prev.hardDeletes || [], dealerId),
    }));
    toastSuccess("Dealer deletion staged for Save Batch.", "Batching");
  }, [isMutatingAction, isSavingBatch]);

  /** Pulls a staged delete back out of the batch (the table's undo). */
  const unstageHardDeleteDealer = useCallback((row) => {
    const dealerId = String(row?.dealer_id ?? "");
    if (!dealerId || isMutatingAction || isSavingBatch) return;
    setDealerChanges((prev) => ({
      ...prev,
      hardDeletes: (prev.hardDeletes || []).filter((id) => !isSameId(id, dealerId)),
    }));
    toastSuccess("Dealer deletion un-staged.", "Batching");
  }, [isMutatingAction, isSavingBatch]);


  // -- batch actions

  /**
   * Throws away every staged change and restores the last known server
   * state. This is a no-op if nothing is pending.
   */
  const handleCancelBatch = useCallback(() => {
    if (isMutatingAction || isSavingBatch || !hasPendingChanges) return;
    batchActiveRef.current = false;
    setOrderedDealers(seedDealers);
    setDealerChanges(createEmptyDealerChanges());
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    resetCityOptions();
    toastSuccess("Batch changes canceled.", "Batching");
  }, [hasPendingChanges, isMutatingAction, isSavingBatch, resetCityOptions, seedDealers]);

  /**
   * Writes all staged changes to the database via `executeBatchSave`,
   * then refreshes the server data so real ids replace any temp ids.
   *
   * Failures are reported through a toast and the batch is left staged
   * so nothing the user typed is lost.
   */
  const handleSaveBatch = useCallback(async () => {
    if (!hasPendingChanges || isSavingBatch || isMutatingAction) return;
    setIsSavingBatch(true);
    setIsMutatingAction(true);
    try {
      await executeBatchSave(dealerChanges);
      setDealerChanges(createEmptyDealerChanges());
      batchActiveRef.current = false;
      router.refresh();
      toastSuccess(`Saved ${pendingSummary.total} batched change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save batched changes.");
    } finally {
      setIsMutatingAction(false);
      setIsSavingBatch(false);
    }
  }, [dealerChanges, hasPendingChanges, isMutatingAction, isSavingBatch, pendingSummary.total, router]);


  // -- submit handlers

  /**
   * Validates and stages an Add or Edit form submission.
   *
   * Business rules checked here:
   * - Dealer code and name are required.
   * - Credit limit must be a number of 0 or more.
   * - Dealer codes are unique across the whole list (excluding the row
   *   being edited), so duplicates are caught before Save Batch.
   *
   * New dealers are staged with a temp id and only become real rows when
   * the batch is saved.
   */
  const submitDealerForm = useCallback(() => {
    const isEdit = dialog?.kind === "edit-dealer";
    const target = dialog?.target;
    if (isEdit && !target?.dealer_id) { toastError("Invalid dealer."); return; }

    const payload = buildDealerPayloadFromDraft(dealerDraft);
    if (!payload.dealer_code) { toastError("Dealer code is required."); return; }
    if (!payload.dealer_name) { toastError("Dealer name is required."); return; }
    if (payload.credit_limit !== null && !isValidCreditLimit(payload.credit_limit)) {
      toastError("Credit limit must be a number of 0 or more.");
      return;
    }
    const isDuplicateCode = orderedDealers.some(
      (dealer) => !isSameId(dealer?.dealer_id, target?.dealer_id) && compareText(dealer?.dealer_code, payload.dealer_code) === 0,
    );
    if (isDuplicateCode) { toastError("Dealer code already exists."); return; }

    if (!isEdit) {
      const tempDealerId = createTempId(TEMP_DEALER_PREFIX);
      setOrderedDealers((prev) => [
        ...prev,
        mapDealerRow({ ...payload, dealer_id: tempDealerId, is_active: true }, prev.length),
      ]);
      setDealerChanges((prev) => ({
        ...prev,
        creates: [...prev.creates, { tempId: tempDealerId, payload: { ...payload, is_active: true } }],
      }));
      setDialog(EMPTY_DIALOG);
      setDealerDraft(createEmptyDealerDraft());
      toastSuccess("Dealer staged for Save Batch.", "Batching");
      return;
    }

    // Editing an existing dealer stages a field patch; editing a not-yet
    // saved dealer rewrites the staged create instead.
    const dealerId = target.dealer_id;
    setOrderedDealers((prev) =>
      prev.map((dealer, index) => {
        if (!isSameId(dealer?.dealer_id, dealerId)) return dealer;
        return mapDealerRow({ ...dealer, ...payload }, index);
      }),
    );
    setDealerChanges((prev) => {
      if (isTempDealerId(dealerId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, dealerId)) return entry;
            return { ...entry, payload: { ...entry.payload, ...payload } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(dealerId)]: mergeUpdatePatch(prev.updates?.[String(dealerId)], payload),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    setDealerDraft(createEmptyDealerDraft());
    toastSuccess("Dealer edit staged for Save Batch.", "Batching");
  }, [dealerDraft, dialog?.kind, dialog?.target, orderedDealers]);

  /** Stages enabling/disabling a dealer (or discards it if unsaved). */
  const submitToggleDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    const dealerId = row.dealer_id;
    const nextIsActive = Boolean(dialog?.nextIsActive);
    setOrderedDealers((prev) =>
      prev.map((dealer, index) => {
        if (!isSameId(dealer?.dealer_id, dealerId)) return dealer;
        return mapDealerRow({ ...dealer, is_active: nextIsActive }, index);
      }),
    );
    setDealerChanges((prev) => {
      if (isTempDealerId(dealerId)) {
        return {
          ...prev,
          creates: prev.creates.map((entry) => {
            if (!isSameId(entry?.tempId, dealerId)) return entry;
            return { ...entry, payload: { ...entry.payload, is_active: nextIsActive } };
          }),
        };
      }
      return {
        ...prev,
        updates: {
          ...prev.updates,
          [String(dealerId)]: mergeUpdatePatch(prev.updates?.[String(dealerId)], { is_active: nextIsActive }),
        },
      };
    });
    setDialog(EMPTY_DIALOG);
    toastSuccess(nextIsActive ? "Dealer enabled — staged for Save Batch." : "Dealer disabled — staged for Save Batch.", "Batching");
  }, [dialog?.nextIsActive, dialog?.target]);

  /**
   * Stages a deactivation. An unsaved dealer is dropped from the batch
   * outright, because deactivating it would have nothing to act on.
   */
  const submitDeactivateDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    const dealerId = row.dealer_id;
    if (isTempDealerId(dealerId)) {
      setOrderedDealers((prev) => prev.filter((dealer) => !isSameId(dealer?.dealer_id, dealerId)));
      setDealerChanges((prev) => ({
        ...prev,
        creates: prev.creates.filter((entry) => !isSameId(entry?.tempId, dealerId)),
        updates: removeObjectKey(prev.updates, String(dealerId)),
      }));
      setDialog(EMPTY_DIALOG);
      toastSuccess("Staged dealer removed.", "Batching");
      return;
    }
    setDealerChanges((prev) => ({
      ...prev,
      deactivations: appendUniqueId(prev.deactivations, dealerId),
    }));
    setDialog(EMPTY_DIALOG);
    toastSuccess("Dealer deactivation staged for Save Batch.", "Batching");
  }, [dialog?.target]);


  return {
    decoratedDealers, dialog, dealerDraft, isSavingBatch, isMutatingAction,
    pendingSummary, hasPendingChanges, pendingDeactivatedDealerIds,
    stateOptions, cityOptions, isLoadingCities, handleStateChange, handleCityChange,
    setDealerDraft, closeDialog, openAddDealerDialog, openEditDealerDialog,
    openToggleDealerDialog, openDeactivateDealerDialog, stageHardDeleteDealer, unstageHardDeleteDealer,
    handleCancelBatch, handleSaveBatch, submitDealerForm, submitToggleDealer, submitDeactivateDealer,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

/** Renders "--" for empty values so blank cells read as intentional. */
function displayText(value) {
  return normalizeText(value) || "--";
}

/**
 * Page heading plus the batch toolbar: pending badge, Save/Cancel Batch
 * and Add Dealer. Save and Cancel are disabled until something is staged.
 */
function DealerHeader({ hasPendingChanges, pendingSummary, isSavingBatch, isMutatingAction, handleSaveBatch, handleCancelBatch, openAddDealerDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Dealer Master Setup</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        {hasPendingChanges ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", fontWeight: 600, color: "#856404", background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "999px", padding: "0.25rem 0.7rem", lineHeight: 1.4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#d39e00", flexShrink: 0 }} />
            {pendingSummary.total} pending
          </span>
        ) : null}
        <Button type="button" size="sm" variant="primary" loading={isSavingBatch} disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleSaveBatch}>
          Save Batch
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={!hasPendingChanges || isSavingBatch || isMutatingAction} onClick={handleCancelBatch}>
          Cancel Batch
        </Button>
        <Button type="button" size="sm" variant="success" disabled={isSavingBatch || isMutatingAction} onClick={openAddDealerDialog}>
          Add Dealer
        </Button>
      </div>
    </div>
  );
}


/**
 * The dealer grid: batch markers, Active badge and per-row actions
 * (Edit / Restore / Deactivate / Delete). Deletion always confirms
 * first because it cannot be undone once the batch is saved.
 */
function DealerTable({ decoratedDealers, isMutatingAction, isSavingBatch, pendingDeactivatedDealerIds, openEditDealerDialog, openToggleDealerDialog, openDeactivateDealerDialog, stageHardDeleteDealer, onUndoBatchAction }) {
  const columns = useMemo(
    () => [
      {
        key: "dealer_code", label: "Dealer Code", width: "15%", sortable: true,
        render: (row) => {
          const batchState = String(row?.__batchState || "");
          let markerText = "";
          let markerClass = "";
          switch (batchState) {
            case "hardDeleted": markerText = "Deleted"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "deleted": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deleted"; break;
            case "created": markerText = "New"; markerClass = "psb-batch-marker psb-batch-marker-new"; break;
            case "updated": markerText = "Edited"; markerClass = "psb-batch-marker psb-batch-marker-edited"; break;
            case "activated": markerText = "Activated"; markerClass = "psb-batch-marker psb-batch-marker-activated"; break;
            case "deactivated": markerText = "Deactivated"; markerClass = "psb-batch-marker psb-batch-marker-deactivated"; break;
            default: break;
          }
          return (
            <span>
              {displayText(row?.dealer_code)}
              {markerText ? <span className={markerClass}>{markerText}</span> : null}
            </span>
          );
        },
      },
      { key: "dealer_name", label: "Dealer Name", width: "24%", sortable: true, render: (row) => displayText(row?.dealer_name) },
      { key: "contact_person", label: "Contact Person", width: "17%", sortable: true, render: (row) => displayText(row?.contact_person) },
      { key: "phone", label: "Phone", width: "13%", sortable: true, render: (row) => displayText(row?.phone) },
      { key: "city", label: "City", width: "13%", sortable: true, render: (row) => displayText(row?.city) },
      { key: "state", label: "State", width: "8%", sortable: true, render: (row) => displayText(row?.state) },
      {
        key: "is_active_bool", label: "Active", width: "10%", sortable: true, align: "center",
        render: (row) => <StatusBadge status={row?.is_active_bool ? "active" : "inactive"} />,
      },
    ],
    [],
  );

  const actions = useMemo(
    () => [
      { key: "edit-dealer", label: "Edit", type: "secondary", icon: "pen", disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openEditDealerDialog(row) },
      { key: "restore-dealer", label: "Restore", type: "secondary", icon: "rotate-left", visible: (row) => !Boolean(row?.is_active_bool) || pendingDeactivatedDealerIds.has(String(row?.dealer_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openToggleDealerDialog(row) },
      { key: "deactivate-dealer", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool) && !pendingDeactivatedDealerIds.has(String(row?.dealer_id ?? "")), disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => openDeactivateDealerDialog(row) },
      { key: "delete-dealer", label: "Delete", type: "danger", icon: "trash", confirm: true, confirmMessage: (row) => `Permanently delete ${row?.dealer_name || "this dealer"}? This action cannot be undone.`, disabled: () => isMutatingAction || isSavingBatch, onClick: (row) => stageHardDeleteDealer(row) },
    ],
    [isMutatingAction, isSavingBatch, openDeactivateDealerDialog, openEditDealerDialog, openToggleDealerDialog, pendingDeactivatedDealerIds, stageHardDeleteDealer],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Dealers" subtitle="Dealer master records.">
          <TableZ columns={columns} data={decoratedDealers} rowIdKey="dealer_id" actions={actions} onUndoBatchAction={onUndoBatchAction} emptyMessage="No dealers found." />
        </Card>
      </div>
    </div>
  );
}


/**
 * Renders one form field. State, City and ZIP are dependent dropdowns:
 * State filters City, City filters ZIP.
 *
 * A stored value that is not in the list (typed by hand earlier) is
 * kept as an extra option so it is never silently dropped. If the
 * lists cannot be loaded, the fields fall back to plain text inputs.
 */
function DealerFormField({ field, dealerDraft, setDealerDraft, stateOptions, cityOptions, isLoadingCities, onStateChange, onCityChange, isBusy }) {
  const value = dealerDraft[field.key];
  const handleChange = (e) => setDealerDraft((prev) => ({ ...prev, [field.key]: e.target.value }));
  const hasLookup = stateOptions.length > 0;

  if (field.kind === "state" && hasLookup) {
    const isKnownState = stateOptions.some((entry) => entry.code === value);
    return (
      <Input as="select" value={value} onChange={(e) => onStateChange(e.target.value)} disabled={isBusy}>
        <option value="">Select state</option>
        {value && !isKnownState ? <option value={value}>{value}</option> : null}
        {stateOptions.map((entry) => (
          <option key={entry.code} value={entry.code}>{entry.name}</option>
        ))}
      </Input>
    );
  }

  if (field.kind === "city" && hasLookup && (!dealerDraft.state || isLoadingCities || cityOptions.length > 0)) {
    const isKnownCity = cityOptions.some((entry) => entry.city === value);
    const emptyLabel = !dealerDraft.state ? "Select state first" : isLoadingCities ? "Loading cities..." : "Select city";
    return (
      <Input as="select" value={value} onChange={(e) => onCityChange(e.target.value)} disabled={isBusy || isLoadingCities || !dealerDraft.state}>
        <option value="">{emptyLabel}</option>
        {value && !isKnownCity ? <option value={value}>{value}</option> : null}
        {cityOptions.map((entry) => (
          <option key={entry.city} value={entry.city}>{entry.city}</option>
        ))}
      </Input>
    );
  }

  if (field.kind === "zip" && hasLookup) {
    const zipOptions = cityOptions.find((entry) => entry.city === dealerDraft.city)?.zips || [];
    const waitingForCity = !dealerDraft.city && (!dealerDraft.state || isLoadingCities || cityOptions.length > 0);
    if (waitingForCity || zipOptions.length > 0) {
      const isKnownZip = zipOptions.includes(value);
      return (
        <Input as="select" value={value} onChange={handleChange} disabled={isBusy || waitingForCity}>
          <option value="">{waitingForCity ? "Select city first" : "Select ZIP code"}</option>
          {value && !isKnownZip ? <option value={value}>{value}</option> : null}
          {zipOptions.map((zip) => (
            <option key={zip} value={zip}>{zip}</option>
          ))}
        </Input>
      );
    }
  }

  return (
    <Input
      {...(field.textarea ? { as: "textarea", rows: 2 } : { type: field.type || "text" })}
      value={value}
      onChange={handleChange}
      placeholder={field.placeholder}
      disabled={isBusy}
    />
  );
}

/**
 * The shared modal. Add/Edit renders the full sectioned form (large);
 * enable/disable and deactivate render a short confirmation instead.
 * Every control is disabled while a request is in flight.
 *
 * The Address section is filled in by hand using the cascading
 * State → City → ZIP dropdowns.
 */
function DealerDialog({ dialog, dealerDraft, isMutatingAction, isSavingBatch, stateOptions, cityOptions, isLoadingCities, onStateChange, onCityChange, setDealerDraft, closeDialog, submitDealerForm, submitToggleDealer, submitDeactivateDealer }) {
  const dialogTitle = useMemo(() => {
    const kind = dialog?.kind;
    if (kind === "add-dealer") return "Add Dealer";
    if (kind === "edit-dealer") return "Edit Dealer";
    if (kind === "toggle-dealer") return dialog?.nextIsActive ? "Enable Dealer" : "Disable Dealer";
    if (kind === "deactivate-dealer") return "Deactivate Dealer";
    return "Dealer";
  }, [dialog?.kind, dialog?.nextIsActive]);

  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction || isSavingBatch;
  const isForm = dialog.kind === "add-dealer" || dialog.kind === "edit-dealer";

  return (
    <Modal show onHide={closeDialog} title={dialogTitle} size={isForm ? "lg" : undefined}>
      {isForm ? (
        <div>
          {DEALER_FORM_SECTIONS.map((section) => (
            <div key={section.title} className="mb-3">
              <h6 className="mb-2">{section.title}</h6>
              <div className="row g-2">
                {section.fields.map((field) => (
                  <div key={field.key} className={field.col}>
                    <label className="form-label mb-1">{field.label}{field.required ? " *" : ""}</label>
                    <DealerFormField
                      field={field}
                      dealerDraft={dealerDraft}
                      setDealerDraft={setDealerDraft}
                      stateOptions={stateOptions}
                      cityOptions={cityOptions}
                      isLoadingCities={isLoadingCities}
                      onStateChange={onStateChange}
                      onCityChange={onCityChange}
                      isBusy={isBusy}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.kind === "add-dealer" ? "success" : "primary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitDealerForm}>
              {dialog.kind === "add-dealer" ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-dealer" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable dealer "${dialog.target?.dealer_name || "--"}"?` : `Disable dealer "${dialog.target?.dealer_name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleDealer}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "deactivate-dealer" ? (
        <div>
          <p className="mb-3">Deactivate dealer <strong>&quot;{dialog.target?.dealer_name || "--"}&quot;</strong>? This action will be staged for Save Batch.</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="warning" size="sm" loading={isBusy} disabled={isBusy} onClick={submitDeactivateDealer}>Deactivate</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}


// ─── MAIN VIEW (default export) ────────────────────────────

/**
 * Dealer Master Setup page body: header toolbar, dealer table and the
 * shared dialog. All behaviour lives in `useDealerMasterSetup`; this
 * component only wires the hook up to the presentational pieces.
 */
export default function DealerMasterSetupView({ dealers, states }) {
  const hook = useDealerMasterSetup({ dealers, states });

  return (
    <main className="container py-4">
      <DealerHeader
        hasPendingChanges={hook.hasPendingChanges}
        pendingSummary={hook.pendingSummary}
        isSavingBatch={hook.isSavingBatch}
        isMutatingAction={hook.isMutatingAction}
        handleSaveBatch={hook.handleSaveBatch}
        handleCancelBatch={hook.handleCancelBatch}
        openAddDealerDialog={hook.openAddDealerDialog}
      />
      <DealerTable
        decoratedDealers={hook.decoratedDealers}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        pendingDeactivatedDealerIds={hook.pendingDeactivatedDealerIds}
        openEditDealerDialog={hook.openEditDealerDialog}
        openToggleDealerDialog={hook.openToggleDealerDialog}
        openDeactivateDealerDialog={hook.openDeactivateDealerDialog}
        stageHardDeleteDealer={hook.stageHardDeleteDealer}
        onUndoBatchAction={hook.unstageHardDeleteDealer}
      />
      <DealerDialog
        dialog={hook.dialog}
        dealerDraft={hook.dealerDraft}
        isMutatingAction={hook.isMutatingAction}
        isSavingBatch={hook.isSavingBatch}
        stateOptions={hook.stateOptions}
        cityOptions={hook.cityOptions}
        isLoadingCities={hook.isLoadingCities}
        onStateChange={hook.handleStateChange}
        onCityChange={hook.handleCityChange}
        setDealerDraft={hook.setDealerDraft}
        closeDialog={hook.closeDialog}
        submitDealerForm={hook.submitDealerForm}
        submitToggleDealer={hook.submitToggleDealer}
        submitDeactivateDealer={hook.submitDeactivateDealer}
      />
    </main>
  );
}
