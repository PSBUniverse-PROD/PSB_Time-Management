"use client";
import { useCallback, useMemo, useState } from "react";
// ─── HOOK: useDealerMasterSetup ────────────────────────────
import { Button, Card, Input, Modal, StatusBadge, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import { deleteDealerAction, enrollDealerAction, setDealerActiveAction } from "../data/dealerMasterSetup.actions.js";
import DealerLoginModal from "./DealerLoginModal.jsx";
import DealerErrorHost from "@/modules/dealer/components/DealerErrorHost";
import { errorFromResult, showDealerError } from "@/modules/dealer/data/dealerErrorReport";
import {
  EMPTY_DIALOG,
  compareText,
  createEmptyEnrollDraft,
  generateDealerPassword,
  mapDealerRow,
  normalizeText,
} from "../data/dealerMasterSetup.data.js";

/** Table rows in display order (dealer name). */
function toSortedRows(list) {
  return (Array.isArray(list) ? list : [])
    .map((dealer, index) => mapDealerRow(dealer, index))
    .sort((left, right) => compareText(left.dealer_name, right.dealer_name));
}

export function useDealerMasterSetup({ dealers = [] }) {
  const seedRows = useMemo(() => toSortedRows(dealers), [dealers]);

  // Saves update this copy directly instead of reloading the page. Fresh
  // server data (a normal page load) replaces it.
  const [rows, setRows] = useState(seedRows);
  const [rowsSeed, setRowsSeed] = useState(seedRows);
  if (rowsSeed !== seedRows) {
    setRowsSeed(seedRows);
    setRows(seedRows);
  }

  const [isMutatingAction, setIsMutatingAction] = useState(false);
  const [dialog, setDialog] = useState(EMPTY_DIALOG);
  const [enrollDraft, setEnrollDraft] = useState(createEmptyEnrollDraft());
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // -- dialog actions

  /** Closes the modal, but never while a request is in flight. */
  const closeDialog = useCallback(() => {
    if (isMutatingAction) return;
    setDialog(EMPTY_DIALOG);
  }, [isMutatingAction]);

  const openEnrollDialog = useCallback(() => {
    if (isMutatingAction) return;
    setEnrollDraft(createEmptyEnrollDraft());
    setDialog({ kind: "enroll-dealer", target: null, nextIsActive: null });
  }, [isMutatingAction]);

  const openToggleDealerDialog = useCallback((row) => {
    if (isMutatingAction) return;
    setDialog({ kind: "toggle-dealer", target: row, nextIsActive: !Boolean(row?.is_active_bool) });
  }, [isMutatingAction]);

  const openDeleteDealerDialog = useCallback((row) => {
    if (isMutatingAction) return;
    setDeleteConfirmText("");
    setDialog({ kind: "delete-dealer", target: row, nextIsActive: null });
  }, [isMutatingAction]);

  // -- saving (every change is saved right away)

  /**
   * Runs one server change and applies its result to the table, without
   * reloading the page. On failure the error is shown and the dialog stays
   * open, so nothing typed is lost.
   */
  const runAction = useCallback(async (work, successMessage, applyResult) => {
    if (isMutatingAction) return;
    setIsMutatingAction(true);
    try {
      const response = await work();
      if (!response?.success) throw errorFromResult(response, "Failed to save the change.");
      const result = response.data;
      applyResult?.(result);
      setDialog(EMPTY_DIALOG);
      toastSuccess(typeof successMessage === "function" ? successMessage(result) : successMessage, "Dealer Master");
    } catch (error) {
      showDealerError(error, { title: "Dealer Master", action: "Saving a change in Dealer Master Setup" });
    } finally {
      setIsMutatingAction(false);
    }
  }, [isMutatingAction]);

  /** Enrolls the dealer and creates its portal login. The server assigns the dealer code. */
  const submitEnrollDealer = useCallback(() => {
    if (!normalizeText(enrollDraft.dealer_name)) { toastError("Dealer name is required."); return; }
    if (!normalizeText(enrollDraft.email)) { toastError("Email is required."); return; }
    if (!normalizeText(enrollDraft.phone)) { toastError("Phone is required."); return; }
    if (!normalizeText(enrollDraft.username)) { toastError("Username is required."); return; }
    if (!enrollDraft.password) { toastError("Password is required. Click Generate."); return; }
    runAction(
      () => enrollDealerAction(enrollDraft),
      (result) => `${result?.dealer?.dealer_name || "Dealer"} enrolled as ${result?.dealer?.dealer_code || "a new dealer"}.`,
      (result) => { if (result?.dealer) setRows((prev) => toSortedRows([...prev, result.dealer])); },
    );
  }, [enrollDraft, runAction]);

  const submitToggleDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    const nextIsActive = Boolean(dialog?.nextIsActive);
    runAction(
      () => setDealerActiveAction(row.dealer_id, nextIsActive),
      nextIsActive ? "Dealer enabled." : "Dealer disabled.",
      (updated) => {
        if (!updated) return;
        setRows((prev) => toSortedRows(prev.map((dealer) => (String(dealer.dealer_id) === String(updated.dealer_id) ? updated : dealer))));
      },
    );
  }, [dialog?.nextIsActive, dialog?.target, runAction]);

  const submitDeleteDealer = useCallback(() => {
    const row = dialog?.target;
    if (!row?.dealer_id) { toastError("Invalid dealer."); return; }
    runAction(
      () => deleteDealerAction(row.dealer_id, deleteConfirmText),
      `Dealer ${row.dealer_code || ""} deleted.`,
      () => setRows((prev) => prev.filter((dealer) => String(dealer.dealer_id) !== String(row.dealer_id))),
    );
  }, [deleteConfirmText, dialog?.target, runAction]);

  /**
   * Signs this browser in to the dealer portal as the dealer (no password
   * needed) and opens their account page, where staff fill in the details.
   */
  const loginAsDealer = useCallback(async (row) => {
    if (isMutatingAction || !row?.dealer_id) return;
    setIsMutatingAction(true);
    try {
      const response = await fetch("/api/dealer/login-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealerId: row.dealer_id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) throw errorFromResult(result, "Unable to log in as this dealer.");
      window.location.assign("/dealer/account");
    } catch (error) {
      showDealerError(error, { title: "Login as dealer", action: `Logging in as dealer ${row.dealer_code || ""}` });
      setIsMutatingAction(false);
    }
  }, [isMutatingAction]);

  return {
    rows, dialog, enrollDraft, setEnrollDraft, deleteConfirmText, setDeleteConfirmText, isMutatingAction,
    closeDialog, openEnrollDialog, openToggleDealerDialog, openDeleteDealerDialog,
    submitEnrollDealer, submitToggleDealer, submitDeleteDealer, loginAsDealer,
  };
}

// ─── SUB-COMPONENTS ────────────────────────────────────────

/** Renders "--" for empty values so blank cells read as intentional. */
function displayText(value) {
  return normalizeText(value) || "--";
}

/** Page heading plus the Enroll Dealer button. */
function DealerHeader({ isMutatingAction, openEnrollDialog }) {
  return (
    <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <h4 className="mb-0">Dealer Master Setup</h4>
      <div className="d-flex align-items-center gap-2 flex-wrap">
        <Button type="button" size="sm" variant="success" disabled={isMutatingAction} onClick={openEnrollDialog}>
          Enroll Dealer
        </Button>
      </div>
    </div>
  );
}

/**
 * The dealer grid: Active badge and per-row icon actions
 * (Login as dealer / Login credentials / Activate or Deactivate / Delete).
 */
function DealerTable({ rows, isMutatingAction, loginAsDealer, openDealerLogin, openToggleDealerDialog, openDeleteDealerDialog }) {
  const columns = useMemo(
    () => [
      { key: "dealer_code", label: "Dealer Code", width: "15%", sortable: true, render: (row) => displayText(row?.dealer_code) },
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
      { key: "login-as-dealer", label: "Login as dealer", type: "secondary", icon: "right-to-bracket", disabled: (row) => isMutatingAction || !row?.is_active_bool, onClick: (row) => loginAsDealer(row) },
      { key: "login-dealer", label: "Login credentials", type: "secondary", icon: "key", disabled: () => isMutatingAction, onClick: (row) => openDealerLogin(row) },
      { key: "restore-dealer", label: "Activate", type: "secondary", icon: "rotate-left", visible: (row) => !row?.is_active_bool, disabled: () => isMutatingAction, onClick: (row) => openToggleDealerDialog(row) },
      { key: "deactivate-dealer", label: "Deactivate", type: "secondary", icon: "ban", visible: (row) => Boolean(row?.is_active_bool), disabled: () => isMutatingAction, onClick: (row) => openToggleDealerDialog(row) },
      // Not type "danger": that adds the table's own confirm. The typed-code dialog confirms instead.
      { key: "delete-dealer", label: "Delete", type: "secondary", icon: "trash", disabled: () => isMutatingAction, onClick: (row) => openDeleteDealerDialog(row) },
    ],
    [isMutatingAction, loginAsDealer, openDealerLogin, openDeleteDealerDialog, openToggleDealerDialog],
  );

  return (
    <div className="row g-3 align-items-start">
      <div className="col-12">
        <Card title="Dealers" subtitle="Dealer master records.">
          <TableZ columns={columns} data={rows} rowIdKey="dealer_id" actions={actions} emptyMessage="No dealers found." />
        </Card>
      </div>
    </div>
  );
}

/**
 * The shared modal: Enroll Dealer form, enable/disable confirmation, and
 * delete confirmation (the dealer code must be typed). Every control is
 * disabled while a request is in flight.
 */
function DealerDialog({ dialog, enrollDraft, setEnrollDraft, deleteConfirmText, setDeleteConfirmText, isMutatingAction, closeDialog, submitEnrollDealer, submitToggleDealer, submitDeleteDealer }) {
  if (!dialog?.kind) return null;
  const isBusy = isMutatingAction;
  const target = dialog.target;
  const setField = (key) => (e) => setEnrollDraft((prev) => ({ ...prev, [key]: e.target.value }));
  const deleteCodeMatches = normalizeText(deleteConfirmText).toUpperCase() === normalizeText(target?.dealer_code).toUpperCase();

  let title = "Dealer";
  if (dialog.kind === "enroll-dealer") title = "Enroll Dealer";
  if (dialog.kind === "toggle-dealer") title = dialog.nextIsActive ? "Enable Dealer" : "Disable Dealer";
  if (dialog.kind === "delete-dealer") title = "Delete Dealer";

  return (
    <Modal show onHide={closeDialog} title={title}>
      {dialog.kind === "enroll-dealer" ? (
        <div className="d-flex flex-column gap-3">
          <div className="small text-muted">
            The dealer code (DA001, DA002, …) is assigned automatically. Fill in the rest of the dealer&apos;s details afterwards with &quot;Login as dealer&quot;.
          </div>
          <div>
            <label className="form-label mb-1">Dealer Name *</label>
            <Input value={enrollDraft.dealer_name} onChange={setField("dealer_name")} placeholder="Enter dealer name" disabled={isBusy} autoFocus />
          </div>
          <div className="row g-2">
            <div className="col-12 col-md-6">
              <label className="form-label mb-1">Email *</label>
              <Input type="email" value={enrollDraft.email} onChange={setField("email")} placeholder="Enter email" disabled={isBusy} />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label mb-1">Phone *</label>
              <Input value={enrollDraft.phone} onChange={setField("phone")} placeholder="Enter phone" disabled={isBusy} />
            </div>
          </div>
          <div>
            <label className="form-label mb-1">Username *</label>
            <Input value={enrollDraft.username} onChange={setField("username")} placeholder="e.g. acme-steel" autoComplete="off" disabled={isBusy} />
            <small className="text-muted d-block mt-1">3–50 characters: letters, numbers, dot, dash or underscore. Saved in lowercase.</small>
          </div>
          <div>
            <label className="form-label mb-1">Password *</label>
            <div className="d-flex gap-2">
              <Input value={enrollDraft.password} readOnly placeholder="Click Generate" className="font-monospace" />
              <Button type="button" variant="secondary" disabled={isBusy} onClick={() => setEnrollDraft((prev) => ({ ...prev, password: generateDealerPassword() }))}>
                Generate
              </Button>
            </div>
            <small className="text-muted d-block mt-1">It can be viewed again later with the key (Login credentials) button.</small>
          </div>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="success" size="sm" loading={isBusy} disabled={isBusy} onClick={submitEnrollDealer}>Enroll</Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "toggle-dealer" ? (
        <div>
          <p className="mb-3">{dialog.nextIsActive ? `Enable dealer "${target?.dealer_name || "--"}"?` : `Disable dealer "${target?.dealer_name || "--"}"?`}</p>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant={dialog.nextIsActive ? "primary" : "secondary"} size="sm" loading={isBusy} disabled={isBusy} onClick={submitToggleDealer}>
              {dialog.nextIsActive ? "Enable" : "Disable"}
            </Button>
          </div>
        </div>
      ) : null}

      {dialog.kind === "delete-dealer" ? (
        <div>
          <p className="mb-2">
            This permanently deletes dealer <strong>&quot;{target?.dealer_name || "--"}&quot;</strong> with its portal login, uploaded documents and links. This cannot be undone.
          </p>
          <label className="form-label mb-1">
            Please type <strong>{target?.dealer_code || ""}</strong> to confirm deletion of dealer &quot;{target?.dealer_name || "--"}&quot;.
          </label>
          <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} autoComplete="off" disabled={isBusy} autoFocus />
          <div className="d-flex justify-content-end gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={closeDialog} disabled={isBusy}>Cancel</Button>
            <Button variant="danger" size="sm" loading={isBusy} disabled={isBusy || !deleteCodeMatches} onClick={submitDeleteDealer}>Delete</Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

// ─── MAIN VIEW (default export) ────────────────────────────

/**
 * Dealer Master Setup page body: header, dealer table, the shared dialog and
 * the login credentials modal. All behaviour lives in `useDealerMasterSetup`.
 */
export default function DealerMasterSetupView({ dealers, supportEmail = "" }) {
  const hook = useDealerMasterSetup({ dealers });
  const [loginDealer, setLoginDealer] = useState(null);
  const closeDealerLogin = useCallback(() => setLoginDealer(null), []);

  return (
    <main className="container py-4">
      <DealerHeader isMutatingAction={hook.isMutatingAction} openEnrollDialog={hook.openEnrollDialog} />
      <DealerTable
        rows={hook.rows}
        isMutatingAction={hook.isMutatingAction}
        loginAsDealer={hook.loginAsDealer}
        openDealerLogin={setLoginDealer}
        openToggleDealerDialog={hook.openToggleDealerDialog}
        openDeleteDealerDialog={hook.openDeleteDealerDialog}
      />
      <DealerDialog
        dialog={hook.dialog}
        enrollDraft={hook.enrollDraft}
        setEnrollDraft={hook.setEnrollDraft}
        deleteConfirmText={hook.deleteConfirmText}
        setDeleteConfirmText={hook.setDeleteConfirmText}
        isMutatingAction={hook.isMutatingAction}
        closeDialog={hook.closeDialog}
        submitEnrollDealer={hook.submitEnrollDealer}
        submitToggleDealer={hook.submitToggleDealer}
        submitDeleteDealer={hook.submitDeleteDealer}
      />
      <DealerErrorHost supportEmail={supportEmail} />
      {loginDealer ? (
        <DealerLoginModal key={String(loginDealer.dealer_id)} dealer={loginDealer} onClose={closeDealerLogin} />
      ) : null}
    </main>
  );
}
