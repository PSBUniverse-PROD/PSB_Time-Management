"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, StatusBadge } from "@/shared/components/ui";
import { isSameId, isTempCompanyId, isTempDepartmentId } from "../data/companyDepartmentSetup.data.js";
import { positionLabel } from "./PositionModal.jsx";
import styles from "./OrgFlowSection.module.css";

// Department key for positions with no department (Company Head, etc.).
export const COMPANY_LEVEL_KEY = "company-level";

export function deptKeyOf(position) {
  return position?.dept_id == null ? COMPANY_LEVEL_KEY : String(position.dept_id);
}

function batchMarker(bs) {
  const map = {
    hardDeleted: { t: "Deleted", c: "psb-batch-marker psb-batch-marker-deleted" },
    deleted: { t: "Deactivated", c: "psb-batch-marker psb-batch-marker-deleted" },
    created: { t: "New", c: "psb-batch-marker psb-batch-marker-new" },
    updated: { t: "Edited", c: "psb-batch-marker psb-batch-marker-edited" },
  };
  return map[bs] || { t: "", c: "" };
}

function shortNameOf(company) {
  const s = String(company?.comp_short_name || "").trim();
  return s && s !== "--" ? s : "";
}

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function RowMarker({ row }) {
  const m = batchMarker(row?.__batchState || "");
  if (m.t) return <span className={m.c}>{m.t}</span>;
  if (row && !row.is_active_bool) return <StatusBadge status="inactive" />;
  return null;
}

// Edit / Deactivate or Restore / Delete or Undo delete, for the picked company or department (staged in Save Batch).
function LifecycleButtons({ row, isPendingDeactivation, disabled, onEdit, onRestore, onDeactivate, onDelete, onUndoDelete }) {
  if (!row) return null;
  const isHardDeleted = row.__batchState === "hardDeleted";
  const canRestore = !row.is_active_bool || isPendingDeactivation;
  return (
    <div className="d-flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="secondary" disabled={disabled || isHardDeleted} onClick={() => onEdit(row)}>Edit</Button>
      {canRestore ? (
        <Button type="button" size="sm" variant="secondary" disabled={disabled || isHardDeleted} onClick={() => onRestore(row)}>Restore</Button>
      ) : (
        <Button type="button" size="sm" variant="warning" disabled={disabled || isHardDeleted} onClick={() => onDeactivate(row)}>Deactivate</Button>
      )}
      {isHardDeleted ? (
        <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => onUndoDelete(row)}>Undo delete</Button>
      ) : (
        <Button type="button" size="sm" variant="danger" disabled={disabled} onClick={() => onDelete(row)}>Delete</Button>
      )}
    </div>
  );
}

function Column({ title, count, footer, children }) {
  return (
    <section className={styles.column} aria-label={title}>
      <div className={styles.columnHead}>
        <span className={styles.columnTitle}>{title}</span>
        {count != null ? <span className="small text-muted">{count}</span> : null}
      </div>
      <div className={styles.columnBody}>{children}</div>
      {footer ? <div className={styles.columnFoot}>{footer}</div> : null}
    </section>
  );
}

function Hint({ children }) {
  return <p className="small text-muted mb-0 p-2">{children}</p>;
}

/**
 * Organization Setup, left to right: pick a company, then a department, then
 * a position; the last column shows its reporting line and people.
 * Companies and departments are staged for Save Batch; positions and people
 * save straight away (through the handlers passed in).
 */
export default function OrgFlowSection({
  decoratedCompanies = [], decoratedDepartments = [], selectedCompany, isSaving, isMutatingAction,
  pendingDeactivatedCompanyIds, pendingDeactivatedDepartmentIds,
  onSelectCompany, openAddCompanyDialog, openEditCompanyDialog, openToggleCompanyDialog,
  openDeactivateCompanyDialog, stageHardDeleteCompany, unstageHardDeleteCompany,
  openAddDepartmentDialog, openEditDepartmentDialog, openToggleDepartmentDialog,
  openDeactivateDepartmentDialog, stageHardDeleteDepartment, unstageHardDeleteDepartment,
  allPositions = [], companyPositions = [], isPositionBusy = false, ranks = [],
  selectedDeptKey, onSelectDept, selectedPositionId, onSelectPosition,
  onAddPosition, onEditPosition, onTogglePosition, onDeletePosition, onRemovePerson, onMovePosition,
}) {
  const [deptSearch, setDeptSearch] = useState("");
  const [confirmBox, setConfirmBox] = useState(null);
  const isBusy = Boolean(isSaving || isMutatingAction);
  const askConfirm = (title, message, label, onConfirm) => setConfirmBox({ title, message, label, onConfirm });
  const rankNameById = useMemo(() => new Map(ranks.map((r) => [String(r.rank_id), r.rank_name])), [ranks]);
  const levelLabel = (level) => rankNameById.get(String(level)) || "";

  const deptNameById = useMemo(
    () => new Map(decoratedDepartments.map((d) => [String(d.dept_id), d.dept_name])), [decoratedDepartments]);
  const positionById = useMemo(
    () => new Map(companyPositions.map((p) => [String(p.position_id), p])), [companyPositions]);
  const positionCountByCompany = useMemo(() => {
    const counts = new Map();
    allPositions.forEach((p) => counts.set(String(p.comp_id), (counts.get(String(p.comp_id)) || 0) + 1));
    return counts;
  }, [allPositions]);
  const positionCountByDept = useMemo(() => {
    const counts = new Map();
    companyPositions.forEach((p) => counts.set(deptKeyOf(p), (counts.get(deptKeyOf(p)) || 0) + 1));
    return counts;
  }, [companyPositions]);
  const visibleDepartments = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return decoratedDepartments;
    return decoratedDepartments.filter((d) => [d.dept_name, d.dept_short_name]
      .some((v) => String(v || "").toLowerCase().includes(q)));
  }, [decoratedDepartments, deptSearch]);

  const companyRow = decoratedCompanies.find((c) => isSameId(c.comp_id, selectedCompany?.comp_id)) || null;
  const companySaved = Boolean(selectedCompany) && !isTempCompanyId(selectedCompany.comp_id);
  const isCompanyLevel = selectedDeptKey === COMPANY_LEVEL_KEY;
  const deptRow = selectedDeptKey && !isCompanyLevel
    ? decoratedDepartments.find((d) => isSameId(d.dept_id, selectedDeptKey)) || null
    : null;
  const deptLabel = isCompanyLevel ? "Company-level" : deptRow?.dept_name || "";
  const deptSaved = isCompanyLevel || (deptRow && !isTempDepartmentId(deptRow.dept_id));

  const deptPositions = selectedDeptKey ? companyPositions.filter((p) => deptKeyOf(p) === selectedDeptKey) : [];
  // Positions arrive sorted by rank, then order, so groups come out top rank first.
  const deptPositionGroups = [];
  deptPositions.forEach((p) => {
    const level = String(p.chart_level ?? "");
    let group = deptPositionGroups.find((g) => g.level === level);
    if (!group) {
      group = { level, label: levelLabel(p.chart_level) || "No rank", items: [] };
      deptPositionGroups.push(group);
    }
    group.items.push(p);
  });
  const selectedPosition = deptPositions.find((p) => isSameId(p.position_id, selectedPositionId)) || null;
  const peopleOf = (p) => (p?.holders || []).map((h) => h.full_name).join(", ");
  const labelOf = (p) => positionLabel(p, deptNameById);
  const managers = selectedPosition
    ? (selectedPosition.reports_to_ids || []).map((id) => positionById.get(String(id))).filter(Boolean) : [];
  const directReports = selectedPosition
    ? companyPositions.filter((p) => (p.reports_to_ids || []).some((id) => isSameId(id, selectedPosition.position_id))) : [];
  const goToPosition = (p) => { onSelectDept(deptKeyOf(p)); onSelectPosition(p.position_id); };

  const steps = [
    { n: 1, label: "Company", value: selectedCompany?.comp_name || "" },
    { n: 2, label: "Department", value: selectedDeptKey ? deptLabel : "" },
    { n: 3, label: "Position", value: selectedPosition?.position_name || "" },
    { n: 4, label: "People", value: selectedPosition ? peopleOf(selectedPosition) || "Vacant" : "" },
  ];

  const canAddPosition = companySaved && Boolean(selectedDeptKey) && deptSaved && !isPositionBusy;

  return (
    <>
      <nav className={styles.steps} aria-label="Where you are">
        {steps.map((s, i) => (
          <div key={s.n} className={styles.step}>
            <span className={`${styles.stepDot} ${s.value ? styles.stepDotOn : ""}`}>{s.n}</span>
            <span className={styles.stepText}>
              <span className={styles.stepLabel}>{s.label}</span>
              <span className={styles.stepValue}>{s.value || "Not picked yet"}</span>
            </span>
            {i < steps.length - 1 ? <span className={styles.stepArrow} aria-hidden="true">→</span> : null}
          </div>
        ))}
      </nav>

      <div className={styles.flow}>
        {/* 1 · Company */}
        <Column
          title="1 · Company"
          count={decoratedCompanies.length}
          footer={(
            <>
              <LifecycleButtons
                row={companyRow}
                isPendingDeactivation={pendingDeactivatedCompanyIds?.has(String(companyRow?.comp_id ?? ""))}
                disabled={isBusy}
                onEdit={openEditCompanyDialog}
                onRestore={openToggleCompanyDialog}
                onDeactivate={openDeactivateCompanyDialog}
                onDelete={(row) => askConfirm("Delete Company",
                  `Permanently delete ${row?.comp_name || "this company"}? It is removed when you press Save Batch.`,
                  "Delete Company", () => stageHardDeleteCompany(row))}
                onUndoDelete={unstageHardDeleteCompany}
              />
              <Button type="button" size="sm" variant="success" className="w-100" disabled={isBusy} onClick={openAddCompanyDialog}>
                + Add Company
              </Button>
            </>
          )}
        >
          {decoratedCompanies.length === 0 ? <Hint>No companies yet.</Hint> : decoratedCompanies.map((c) => {
            const active = isSameId(c.comp_id, selectedCompany?.comp_id);
            const meta = [shortNameOf(c), `${positionCountByCompany.get(String(c.comp_id)) || 0} positions`].filter(Boolean).join(" · ");
            return (
              <button key={String(c.comp_id)} type="button" aria-pressed={active} disabled={isBusy}
                className={`${styles.item} ${active ? styles.itemActive : ""}`} onClick={() => onSelectCompany(c)}>
                <span className={styles.itemMain}>
                  <span className={styles.itemName}>{c.comp_name}</span>
                  <span className={styles.itemMeta}>{meta}</span>
                </span>
                <RowMarker row={c} />
              </button>
            );
          })}
        </Column>

        {/* 2 · Department */}
        <Column
          title={selectedCompany ? `2 · Department in ${shortNameOf(selectedCompany) || selectedCompany.comp_name}` : "2 · Department"}
          count={selectedCompany ? decoratedDepartments.length : null}
          footer={selectedCompany ? (
            <>
              <LifecycleButtons
                row={deptRow}
                isPendingDeactivation={pendingDeactivatedDepartmentIds?.has(String(deptRow?.dept_id ?? ""))}
                disabled={isBusy}
                onEdit={openEditDepartmentDialog}
                onRestore={openToggleDepartmentDialog}
                onDeactivate={openDeactivateDepartmentDialog}
                onDelete={(row) => askConfirm("Delete Department",
                  `Permanently delete ${row?.dept_name || "this department"}? It is removed when you press Save Batch.`,
                  "Delete Department", () => stageHardDeleteDepartment(row))}
                onUndoDelete={unstageHardDeleteDepartment}
              />
              <Button type="button" size="sm" variant="success" className="w-100" disabled={isBusy} onClick={openAddDepartmentDialog}>
                + Add Department
              </Button>
            </>
          ) : null}
        >
          {!selectedCompany ? <Hint>Pick a company first.</Hint> : (
            <>
              <Input type="search" value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)}
                placeholder="Search departments" aria-label="Search departments" className="mb-1" />
              <button type="button" aria-pressed={isCompanyLevel}
                className={`${styles.item} ${isCompanyLevel ? styles.itemActive : ""}`} onClick={() => onSelectDept(COMPANY_LEVEL_KEY)}>
                <span className={`${styles.itemName} ${styles.itemMuted}`}>Company-level (no department)</span>
                <span className={styles.count}>{positionCountByDept.get(COMPANY_LEVEL_KEY) || 0}</span>
              </button>
              {visibleDepartments.length === 0 ? <Hint>No departments found.</Hint> : visibleDepartments.map((d) => {
                const active = isSameId(d.dept_id, selectedDeptKey);
                return (
                  <button key={String(d.dept_id)} type="button" aria-pressed={active}
                    className={`${styles.item} ${active ? styles.itemActive : ""}`} onClick={() => onSelectDept(String(d.dept_id))}>
                    <span className={styles.itemName}>{d.dept_name}</span>
                    <span className="d-flex align-items-center gap-1">
                      <RowMarker row={d} />
                      <span className={styles.count}>{positionCountByDept.get(String(d.dept_id)) || 0}</span>
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </Column>

        {/* 3 · Position */}
        <Column
          title={selectedDeptKey ? `3 · Position in ${deptLabel}` : "3 · Position"}
          count={selectedDeptKey ? deptPositions.length : null}
          footer={selectedDeptKey ? (
            <Button type="button" size="sm" variant="success" className="w-100" disabled={!canAddPosition}
              onClick={() => onAddPosition?.()}>+ Add Position</Button>
          ) : null}
        >
          {!selectedDeptKey ? <Hint>Pick a department, or Company-level for positions like Company Head.</Hint>
            : !companySaved ? <Hint>Press Save Batch first, then add positions to this company.</Hint>
            : !deptSaved ? <Hint>Press Save Batch first, then add positions to this department.</Hint>
            : deptPositions.length === 0 ? <Hint>No positions here yet. Add the first one.</Hint>
              : deptPositionGroups.map((group) => (
                <div key={group.level || "none"} className={styles.rankGroup}>
                  <span className={styles.rankLabel}>{group.label}</span>
                  {group.items.map((p, i) => {
                    const active = isSameId(p.position_id, selectedPositionId);
                    const reportsTo = (p.reports_to_ids || []).map((id) => labelOf(positionById.get(String(id)))).filter(Boolean).join(", ");
                    return (
                      <div key={String(p.position_id)} className={styles.orderRow}>
                        <button type="button" aria-pressed={active}
                          className={`${styles.item} ${styles.positionCard} ${active ? styles.itemActive : ""}`}
                          onClick={() => onSelectPosition(p.position_id)}>
                          <span className={styles.cardTop}>
                            <span className={styles.itemName}>{p.position_name}{p.branch ? ` (${p.branch})` : ""}</span>
                            {!p.is_active ? <StatusBadge status="inactive" /> : null}
                          </span>
                          <span className={styles.itemMeta}>{reportsTo ? `Reports to ${reportsTo}` : "Top of the chart"}</span>
                          <span className={styles.itemMeta}>{peopleOf(p) || "Vacant"}</span>
                        </button>
                        <span className={styles.orderButtons}>
                          <button type="button" className={styles.orderButton} aria-label={`Move ${p.position_name} up`}
                            disabled={i === 0 || isPositionBusy} onClick={() => onMovePosition?.(p, -1)}>▲</button>
                          <button type="button" className={styles.orderButton} aria-label={`Move ${p.position_name} down`}
                            disabled={i === group.items.length - 1 || isPositionBusy} onClick={() => onMovePosition?.(p, 1)}>▼</button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
        </Column>

        {/* 4 · People and reporting */}
        <Column title="4 · People and reporting">
          {!selectedPosition ? <Hint>Pick a position to see who reports to whom and who sits in it.</Hint> : (
            <div className={styles.detail}>
              <div className={styles.detailHead}>
                <div>
                  <h2 className={styles.detailTitle}>{selectedPosition.position_name}</h2>
                  <div className={styles.itemMeta}>
                    {[selectedCompany?.comp_name, deptLabel, selectedPosition.branch || "All branches", levelLabel(selectedPosition.chart_level)]
                      .filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="d-flex flex-wrap align-items-center gap-1">
                  <StatusBadge status={selectedPosition.is_active ? "active" : "inactive"} />
                  <Button type="button" size="sm" variant="primary" disabled={isPositionBusy}
                    onClick={() => onEditPosition?.(selectedPosition)}>Edit</Button>
                  {selectedPosition.is_active ? (
                    <Button type="button" size="sm" variant="warning" disabled={isPositionBusy}
                      onClick={() => onTogglePosition?.(selectedPosition, false)}>Deactivate</Button>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" disabled={isPositionBusy}
                      onClick={() => onTogglePosition?.(selectedPosition, true)}>Restore</Button>
                  )}
                  <Button type="button" size="sm" variant="danger" disabled={isPositionBusy}
                    onClick={() => askConfirm("Delete Position",
                      `Permanently delete the position "${selectedPosition.position_name}"? Its reporting lines and people in it are removed too.`,
                      "Delete Position", () => onDeletePosition?.(selectedPosition))}>Delete</Button>
                </div>
              </div>

              <div>
                <div className={styles.sectionLabel}>Reporting line</div>
                <div className={styles.chain}>
                  <span className={styles.chainLabel}>Reports to</span>
                  {managers.length === 0 ? <span className={styles.itemMeta}>Nobody — top of the chart</span> : managers.map((m) => (
                    <button key={String(m.position_id)} type="button" className={styles.chainItem} onClick={() => goToPosition(m)}>
                      {labelOf(m)} <span className={styles.chainPeople}>· {peopleOf(m) || "Vacant"}</span>
                    </button>
                  ))}
                  <span className={styles.chainLine} aria-hidden="true"></span>
                  <span className={styles.chainSelf}>
                    {selectedPosition.position_name} <span className={styles.chainPeople}>· {peopleOf(selectedPosition) || "Vacant"}</span>
                  </span>
                  <span className={styles.chainLine} aria-hidden="true"></span>
                  <span className={styles.chainLabel}>Direct reports</span>
                  {directReports.length === 0 ? <span className={styles.itemMeta}>None</span> : directReports.map((r) => (
                    <button key={String(r.position_id)} type="button" className={styles.chainItem} onClick={() => goToPosition(r)}>
                      {labelOf(r)} <span className={styles.chainPeople}>· {peopleOf(r) || "Vacant"}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className={styles.sectionLabel}>People in this position</span>
                  <Button type="button" size="sm" variant="success" disabled={isPositionBusy}
                    onClick={() => onEditPosition?.(selectedPosition)}>+ Add person</Button>
                </div>
                {(selectedPosition.holders || []).length === 0 ? <Hint>Nobody yet. Use Add person.</Hint> : (
                  <div className={styles.people}>
                    {selectedPosition.holders.map((h) => (
                      <div key={String(h.user_id)} className={styles.person}>
                        <span className={styles.avatar} aria-hidden="true">{initialsOf(h.full_name)}</span>
                        <span className="flex-grow-1">{h.full_name}</span>
                        {h.is_primary ? <span className={styles.mainSeat}>★ Main seat</span> : null}
                        <Button type="button" size="sm" variant="ghost" disabled={isPositionBusy}
                          onClick={() => askConfirm("Remove Person",
                            `Remove ${h.full_name} from ${selectedPosition.position_name}?`,
                            "Remove", () => onRemovePerson?.(selectedPosition, h.user_id))}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="small text-muted mt-2">Positions and people save right away. Companies and departments use Save Batch.</div>
              </div>
            </div>
          )}
        </Column>
      </div>

      <Modal show={Boolean(confirmBox)} onHide={() => setConfirmBox(null)} title={confirmBox?.title || ""}
        footer={(
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmBox(null)}>Cancel</Button>
            <Button type="button" variant="danger" onClick={() => {
              const run = confirmBox?.onConfirm;
              setConfirmBox(null);
              if (typeof run === "function") run();
            }}>{confirmBox?.label || "OK"}</Button>
          </>
        )}>
        <p className="mb-0">{confirmBox?.message}</p>
      </Modal>
    </>
  );
}
