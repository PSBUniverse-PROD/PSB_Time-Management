"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, TableZ, toastError, toastSuccess } from "@/shared/components/ui";
import { loadRoleUsersAction, saveRoleUsersAction } from "../data/applicationSetup.actions.js";

const MAX_CANDIDATES = 50;

function compareUsers(left, right) {
  return String(left?.full_name || "").localeCompare(String(right?.full_name || ""), undefined, { sensitivity: "base", numeric: true });
}

function batchMarker(batchState) {
  if (batchState === "hardDeleted") return { text: "Deleted", cls: "psb-batch-marker psb-batch-marker-deleted" };
  if (batchState === "created") return { text: "New", cls: "psb-batch-marker psb-batch-marker-new" };
  return { text: "", cls: "" };
}

// Staged changes here are saved by this modal's own Save Batch, independent of the page batch.
export default function RoleUsersModal({ role, appName, onClose }) {
  const roleId = role?.role_id;
  const [users, setUsers] = useState([]);
  const [baselineIds, setBaselineIds] = useState([]);
  const [pendingAdds, setPendingAdds] = useState([]);
  const [pendingRemoves, setPendingRemoves] = useState([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const applyLoaded = useCallback((result) => {
    setUsers(Array.isArray(result?.users) ? result.users : []);
    setBaselineIds((Array.isArray(result?.memberUserIds) ? result.memberUserIds : []).map((id) => String(id)));
    setPendingAdds([]); setPendingRemoves([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRoleUsersAction(roleId)
      .then((result) => { if (!cancelled) applyLoaded(result); })
      .catch((error) => { if (cancelled) return; toastError(error?.message || "Failed to load role users."); onClose?.(); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [applyLoaded, onClose, roleId]);

  const usersById = useMemo(() => new Map(users.map((u) => [String(u?.user_id ?? ""), u])), [users]);
  const pendingTotal = pendingAdds.length + pendingRemoves.length;

  const memberRows = useMemo(() => {
    const removeSet = new Set(pendingRemoves);
    const saved = baselineIds.map((id) => {
      const user = usersById.get(id) || { user_id: id, full_name: `User ${id}`, username: "--", email: "--" };
      return { ...user, id, __batchState: removeSet.has(id) ? "hardDeleted" : "none" };
    });
    const added = pendingAdds.map((id) => usersById.get(id)).filter(Boolean).map((user) => ({ ...user, id: String(user.user_id), __batchState: "created" }));
    return [...saved, ...added].sort(compareUsers);
  }, [baselineIds, pendingAdds, pendingRemoves, usersById]);

  const matchingCandidates = useMemo(() => {
    const taken = new Set([...baselineIds, ...pendingAdds]);
    const term = search.trim().toLowerCase();
    return users
      .filter((u) => u?.is_active && !taken.has(String(u?.user_id ?? "")))
      .filter((u) => !term || [u.full_name, u.username, u.email, u.employee_id].some((v) => String(v || "").toLowerCase().includes(term)))
      .sort(compareUsers);
  }, [baselineIds, pendingAdds, search, users]);
  const candidates = useMemo(() => matchingCandidates.slice(0, MAX_CANDIDATES), [matchingCandidates]);

  const stageAdd = useCallback((user) => {
    const id = String(user?.user_id ?? "");
    if (!id || isSaving) return;
    setPendingAdds((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, [isSaving]);

  const stageRemove = useCallback((row) => {
    const id = String(row?.user_id ?? "");
    if (!id || isSaving) return;
    if (pendingAdds.includes(id)) { setPendingAdds((prev) => prev.filter((e) => e !== id)); return; }
    setPendingRemoves((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, [isSaving, pendingAdds]);

  const unstageRemove = useCallback((row) => {
    const id = String(row?.user_id ?? "");
    if (!id || isSaving) return;
    setPendingRemoves((prev) => prev.filter((e) => e !== id));
  }, [isSaving]);

  const handleCancelBatch = useCallback(() => {
    if (isSaving) return;
    setPendingAdds([]); setPendingRemoves([]);
  }, [isSaving]);

  const handleSaveBatch = useCallback(async () => {
    if (pendingTotal === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const resolveId = (id) => usersById.get(id)?.user_id ?? id;
      await saveRoleUsersAction(roleId, { addUserIds: pendingAdds.map(resolveId), removeUserIds: pendingRemoves.map(resolveId) });
      applyLoaded(await loadRoleUsersAction(roleId));
      toastSuccess(`Saved ${pendingTotal} user assignment change(s).`, "Save Batch");
    } catch (error) {
      toastError(error?.message || "Failed to save user assignments.");
    } finally { setIsSaving(false); }
  }, [applyLoaded, isSaving, pendingAdds, pendingRemoves, pendingTotal, roleId, usersById]);

  const requestClose = useCallback(() => {
    if (isSaving) return;
    if (pendingTotal > 0 && !window.confirm("Discard staged user changes?")) return;
    onClose?.();
  }, [isSaving, onClose, pendingTotal]);

  const columns = useMemo(() => [
    { key: "full_name", label: "Full Name", width: "36%", sortable: true, render: (row) => {
      const m = batchMarker(row?.__batchState || "");
      return (<span>{row?.full_name || "--"}{m.text ? <span className={m.cls}>{m.text}</span> : null}</span>);
    }},
    { key: "username", label: "Username", width: "24%", sortable: true },
    { key: "email", label: "Email", width: "40%", sortable: true },
  ], []);

  const actions = useMemo(() => [
    { key: "remove-role-user", label: "Remove", type: "secondary", icon: "trash", disabled: () => isSaving, onClick: (r) => stageRemove(r) },
  ], [isSaving, stageRemove]);

  const footer = (
    <>
      <span className={`small me-auto ${pendingTotal > 0 ? "text-warning-emphasis fw-semibold" : "text-muted"}`}>
        {isSaving ? "Saving batch..." : pendingTotal > 0 ? `${pendingTotal} staged change(s)` : "No changes"}
      </span>
      {pendingAdds.length > 0 ? <span className="psb-batch-chip psb-batch-chip-added">+{pendingAdds.length} Added</span> : null}
      {pendingRemoves.length > 0 ? <span className="psb-batch-chip psb-batch-chip-deleted">-{pendingRemoves.length} Removed</span> : null}
      <Button type="button" variant="primary" loading={isSaving} disabled={pendingTotal === 0 || isSaving || isLoading} onClick={handleSaveBatch}>Save Batch</Button>
      <Button type="button" variant="ghost" disabled={pendingTotal === 0 || isSaving} onClick={handleCancelBatch}>Cancel Batch</Button>
      <Button type="button" variant="ghost" disabled={isSaving} onClick={requestClose}>Close</Button>
    </>
  );

  return (
    <Modal show onHide={requestClose} title={`Users in role: ${role?.role_name || ""}`} footer={footer} size="lg" backdrop="static">
      <div className="d-flex flex-column gap-3">
        <div className="small text-muted">Assigning users to <strong>{role?.role_name || "selected role"}</strong> in <strong>{appName || "selected application"}</strong></div>
        {isLoading ? <div className="small text-muted">Loading users...</div> : (
          <>
            <div>
              <label className="form-label mb-1">Add users</label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, username, email or employee ID" autoFocus />
              <div className="border rounded mt-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {candidates.length === 0 ? <div className="p-2 small text-muted">No users available to add.</div> : candidates.map((user) => (
                  <div key={String(user.user_id)} className="d-flex align-items-center justify-content-between gap-2 px-2 py-1 border-bottom">
                    <div className="small">
                      <div className="fw-semibold">{user.full_name}</div>
                      <div className="text-muted">{user.username} · {user.email}</div>
                    </div>
                    <Button type="button" size="sm" variant="success" disabled={isSaving} onClick={() => stageAdd(user)}>+ Add</Button>
                  </div>
                ))}
              </div>
              {matchingCandidates.length > MAX_CANDIDATES ? <small className="text-muted d-block mt-1">Showing first {MAX_CANDIDATES} of {matchingCandidates.length}. Refine the search to narrow the list.</small> : null}
            </div>
            <div>
              <h6 className="mb-2 small fw-semibold">Users in this role ({memberRows.length})</h6>
              <TableZ columns={columns} data={memberRows} rowIdKey="user_id"
                actions={actions} searchPlaceholder="Search users in this role"
                emptyMessage="No users assigned to this role."
                onUndoBatchAction={unstageRemove} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}