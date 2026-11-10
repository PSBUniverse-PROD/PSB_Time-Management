"use client";

import { useState } from "react";
import { Button, Input, Modal, StatusBadge, toastError, toastSuccess } from "@/shared/components/ui";
import {
  deleteRankAction, moveRankAction, saveRankAction, setDefaultRankAction, setRankActiveAction,
} from "../data/companyDepartmentSetup.actions.js";
import styles from "./RanksModal.module.css";

/**
 * Ranks: add, rename, reorder, disable/enable and delete. One list for every
 * company; the order here sorts positions. Changes save straight away.
 * ranks: [{ rank_id, rank_name, rank_order, is_active, position_count }] in order.
 */
export default function RanksModal({ show, ranks = [], onClose, onChanged }) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState(null); // { rank_id, name }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const activeCount = ranks.filter((r) => r.is_active).length;

  const run = async (work, message) => {
    if (isBusy) return false;
    setIsBusy(true);
    try {
      const result = await work();
      if (result && result.success === false) throw new Error(result.error || "Failed to update ranks.");
      await onChanged?.();
      toastSuccess(message, "Ranks");
      return true;
    } catch (error) {
      toastError(error?.message || "Failed to update ranks.");
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const addRank = async () => {
    const name = newName.trim();
    if (!name) { toastError("Type a rank name first."); return; }
    if (await run(() => saveRankAction({ rank_name: name }), `Rank "${name}" added.`)) setNewName("");
  };

  const saveRename = async () => {
    const name = String(editing?.name || "").trim();
    if (!name) { toastError("Rank name is required."); return; }
    if (await run(() => saveRankAction({ rank_id: editing.rank_id, rank_name: name }), "Rank renamed.")) setEditing(null);
  };

  const confirmAndDelete = async () => {
    const rank = confirmDelete;
    setConfirmDelete(null);
    if (rank) await run(() => deleteRankAction(rank.rank_id), `Rank "${rank.rank_name}" deleted.`);
  };

  return (
    <>
      <Modal show={Boolean(show) && !confirmDelete} onHide={isBusy ? undefined : onClose} title="Ranks" size="lg"
        footer={<Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>Close</Button>}>
        <p className={styles.intro}>
          Ranks sort positions in lists and on the chart, top to bottom in this order. They are shared by every company. Changes save straight away.
        </p>

        <div className={styles.list}>
          {ranks.length === 0 ? <div className={styles.empty}>No ranks yet. Add the first one below.</div> : ranks.map((rank, i) => {
            const isEditing = editing && String(editing.rank_id) === String(rank.rank_id);
            const count = Number(rank.position_count) || 0;
            return (
              <div key={String(rank.rank_id)} className={`${styles.row} ${rank.is_active ? "" : styles.rowOff}`}>
                <span className={styles.orderButtons}>
                  <button type="button" className={styles.orderButton} aria-label={`Move ${rank.rank_name} up`}
                    disabled={i === 0 || isBusy} onClick={() => run(() => moveRankAction(rank.rank_id, -1), "Order updated.")}>▲</button>
                  <button type="button" className={styles.orderButton} aria-label={`Move ${rank.rank_name} down`}
                    disabled={i === ranks.length - 1 || isBusy} onClick={() => run(() => moveRankAction(rank.rank_id, 1), "Order updated.")}>▼</button>
                </span>

                {isEditing ? (
                  <form className={styles.renameForm} onSubmit={(e) => { e.preventDefault(); void saveRename(); }}>
                    <Input value={editing.name} onChange={(e) => setEditing((prev) => ({ ...prev, name: e.target.value }))}
                      aria-label="Rank name" maxLength={50} autoFocus />
                    <Button type="submit" size="sm" variant="primary" disabled={isBusy}>Save</Button>
                    <Button type="button" size="sm" variant="ghost" disabled={isBusy} onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <span className={styles.nameBlock}>
                      <span className={styles.name}>{rank.rank_name}</span>
                      <span className={styles.meta}>{count ? `${count} position${count === 1 ? "" : "s"}` : "Not used"}</span>
                    </span>
                    <span className={styles.actions}>
                      <StatusBadge status={rank.is_active ? "active" : "inactive"} label={rank.is_active ? "ACTIVE" : "DISABLED"} />
                      {rank.is_default ? (
                        <span className={styles.defaultTag}>★ Default</span>
                      ) : (
                        <Button type="button" size="sm" variant="ghost" disabled={isBusy || !rank.is_active}
                          title={rank.is_active ? undefined : "Enable this rank first."}
                          onClick={() => run(() => setDefaultRankAction(rank.rank_id), `"${rank.rank_name}" is now the default rank.`)}>Make default</Button>
                      )}
                      <Button type="button" size="sm" variant="secondary" disabled={isBusy}
                        onClick={() => setEditing({ rank_id: rank.rank_id, name: rank.rank_name })}>Rename</Button>
                      {rank.is_active ? (
                        <Button type="button" size="sm" variant="warning" disabled={isBusy || activeCount <= 1 || rank.is_default}
                          title={rank.is_default ? "Make another rank the default first." : undefined}
                          onClick={() => run(() => setRankActiveAction(rank.rank_id, false), `Rank "${rank.rank_name}" disabled.`)}>Disable</Button>
                      ) : (
                        <Button type="button" size="sm" variant="secondary" disabled={isBusy}
                          onClick={() => run(() => setRankActiveAction(rank.rank_id, true), `Rank "${rank.rank_name}" enabled.`)}>Enable</Button>
                      )}
                      <Button type="button" size="sm" variant="danger" disabled={isBusy || count > 0 || rank.is_default}
                        title={rank.is_default ? "Make another rank the default first."
                          : count > 0 ? "Used by positions. Move them to another rank first, or disable this rank." : undefined}
                        onClick={() => setConfirmDelete(rank)}>Delete</Button>
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <form className={styles.addRow} onSubmit={(e) => { e.preventDefault(); void addRank(); }}>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="New rank name, e.g. Supervisor" aria-label="New rank name" maxLength={50} />
          <Button type="submit" size="sm" variant="success" disabled={isBusy || !newName.trim()}>+ Add Rank</Button>
        </form>
        <p className={styles.hint}>
          A disabled rank can&apos;t be picked for new positions; positions already using it keep it.
          A rank can only be deleted when no position uses it. New positions start on the ★ Default rank.
        </p>
      </Modal>

      <Modal show={Boolean(confirmDelete)} onHide={() => setConfirmDelete(null)} title="Delete Rank"
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button type="button" variant="danger" onClick={() => { void confirmAndDelete(); }}>Delete Rank</Button>
          </>
        )}>
        <p className="mb-0">Permanently delete the rank &quot;{confirmDelete?.rank_name}&quot;? This can&apos;t be undone.</p>
      </Modal>
    </>
  );
}
