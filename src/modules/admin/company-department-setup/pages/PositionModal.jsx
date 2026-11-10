"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, toastError } from "@/shared/components/ui";
import { saveOrgPositionAction } from "../data/companyDepartmentSetup.actions.js";
import styles from "./PositionModal.module.css";

// Ranks come from psb_s_rank (managed with the Ranks button on Organization Setup).
// chart_level holds the rank_id. Rank sorts positions; who sits above whom comes from "Reports to".
// A new position starts on the rank marked ★ Default in the Ranks window, else the last active rank.
function defaultRankId(ranks) {
  const active = (ranks || []).filter((r) => r.is_active);
  const chosen = active.find((r) => r.is_default) || active[active.length - 1];
  return String(chosen?.rank_id ?? "");
}
const MAX_MATCHES = 8;

/** "Scheduling · Team Lead", "Company Head (Texas)". */
export function positionLabel(position, departmentNameById) {
  if (!position) return "";
  const dept = position.dept_id != null ? departmentNameById.get(String(position.dept_id)) : "";
  const branch = position.branch ? ` (${position.branch})` : "";
  return `${dept ? `${dept} · ` : ""}${position.position_name || ""}${branch}`;
}

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function isAllBranch(value) {
  return /^all( branches)?$/i.test(String(value || "").trim());
}

function peopleOf(position) {
  return (position?.holders || []).map((h) => h.full_name).join(", ");
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PreviewCard({ title, subtitle, vacant = false, current = false }) {
  const cls = [styles.previewCard, current ? styles.previewCurrent : "", vacant && !current ? styles.previewVacant : ""].filter(Boolean).join(" ");
  return (
    <div className={cls}>
      <span className={`${styles.avatar} ${vacant ? styles.avatarMuted : ""}`} aria-hidden="true">{vacant ? "?" : initialsOf(title)}</span>
      <span className={styles.previewText}>
        <span className={styles.previewTitle}>{title}</span>
        <span className={styles.previewSub}>{subtitle}</span>
      </span>
    </div>
  );
}

/**
 * Add / Edit Position. Saves straight away (not part of Save Batch).
 * departments: the company's saved departments; positions: the company's positions.
 */
export default function PositionModal({ company, position, departments, positions, users, ranks = [], defaultDeptId = "", onClose, onSaved }) {
  const isEdit = Boolean(position?.position_id);
  const [name, setName] = useState(position?.position_name || "");
  const [deptId, setDeptId] = useState(position?.dept_id != null ? String(position.dept_id) : String(defaultDeptId || ""));
  const [branch, setBranch] = useState(isAllBranch(position?.branch) ? "" : String(position?.branch || ""));
  const [typingBranch, setTypingBranch] = useState(false);
  const [chartLevel, setChartLevel] = useState(() => (position?.chart_level != null ? String(position.chart_level) : defaultRankId(ranks)));
  // Active ranks, plus this position's current rank even if it has been disabled.
  const rankOptions = (ranks || []).filter((r) => r.is_active || String(r.rank_id) === String(position?.chart_level ?? ""));
  const [reportsTo, setReportsTo] = useState(() => (position?.reports_to_ids || []).map((id) => String(id)));
  const [holderIds, setHolderIds] = useState(() => (position?.holders || []).map((h) => String(h.user_id)));
  const [reportSearch, setReportSearch] = useState("");
  const [personSearch, setPersonSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const deptNameById = useMemo(
    () => new Map((departments || []).map((d) => [String(d.dept_id), d.dept_name])), [departments]);
  const positionById = useMemo(
    () => new Map((positions || []).map((p) => [String(p.position_id), p])), [positions]);
  const otherPositions = useMemo(
    () => (positions || []).filter((p) => String(p.position_id) !== String(position?.position_id ?? "")),
    [position?.position_id, positions]);
  const knownBranches = useMemo(
    () => [...new Set((positions || []).map((p) => String(p.branch || "").trim()).filter((b) => b && !isAllBranch(b)))].sort(),
    [positions]);
  const isCustomBranch = Boolean(branch.trim()) && !knownBranches.includes(branch.trim());

  const reportGroups = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    const groups = new Map();
    otherPositions.forEach((p) => {
      const deptName = p.dept_id != null ? deptNameById.get(String(p.dept_id)) || "Department" : "Company-level";
      if (q && ![p.position_name, deptName, peopleOf(p)].some((v) => String(v || "").toLowerCase().includes(q))) return;
      const key = p.dept_id != null ? String(p.dept_id) : "";
      if (!groups.has(key)) groups.set(key, { key, name: deptName, items: [] });
      groups.get(key).items.push(p);
    });
    return [...groups.values()].sort((a, b) => {
      if (a.key === "") return -1;
      if (b.key === "") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [deptNameById, otherPositions, reportSearch]);

  const userById = useMemo(() => new Map((users || []).map((u) => [String(u.user_id), u])), [users]);
  const holderRows = holderIds.map((id) => {
    const saved = (position?.holders || []).find((h) => String(h.user_id) === id);
    return { id, name: userById.get(id)?.full_name || saved?.full_name || `User ${id}`, isMain: Boolean(saved?.is_primary) };
  });
  const seatNamesByUser = useMemo(() => {
    const map = new Map();
    (positions || []).forEach((p) => (p.holders || []).forEach((h) => {
      const key = String(h.user_id);
      map.set(key, [...(map.get(key) || []), p.position_name]);
    }));
    return map;
  }, [positions]);
  const personMatches = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return [];
    return (users || [])
      .filter((u) => !holderIds.includes(String(u.user_id)))
      .filter((u) => [u.full_name, u.username, u.email].some((v) => String(v || "").toLowerCase().includes(q)))
      .slice(0, MAX_MATCHES);
  }, [holderIds, personSearch, users]);

  const managers = reportsTo.map((id) => positionById.get(id)).filter(Boolean);
  const directReports = isEdit
    ? (positions || []).filter((p) => (p.reports_to_ids || []).some((id) => String(id) === String(position.position_id)))
    : [];
  const previewPeople = holderRows.map((r) => r.name).join(", ");

  const toggleReport = (id) => setReportsTo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const addHolder = (user) => {
    const id = String(user?.user_id ?? "");
    if (!id || holderIds.includes(id)) return;
    setHolderIds((prev) => [...prev, id]);
  };
  const removeHolder = (id) => setHolderIds((prev) => prev.filter((x) => String(x) !== String(id)));
  const pickBranch = (value) => { setBranch(value); setTypingBranch(false); };

  const handleSave = async () => {
    if (!name.trim()) { toastError("Position name is required."); return; }
    if (!chartLevel) { toastError("Pick a rank."); return; }
    setIsSaving(true);
    try {
      const result = await saveOrgPositionAction({
        position_id: position?.position_id ?? null,
        comp_id: company.comp_id,
        dept_id: deptId || null,
        position_name: name,
        branch: branch.trim(),
        chart_level: Number(chartLevel),
        reports_to_ids: reportsTo,
        user_ids: holderIds,
      });
      if (!result?.success) {
        toastError(result?.error || "Failed to save the position.");
        return;
      }
      await onSaved?.(isEdit ? "Position saved." : "Position added.");
    } catch (error) {
      toastError(error?.message || "Failed to save the position.");
    } finally {
      setIsSaving(false);
    }
  };

  const footer = (
    <div className={styles.footer}>
      <span className={styles.hint}>Saves straight away. No Save Batch needed.</span>
      <div className="d-flex gap-2">
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button type="button" variant="primary" onClick={handleSave} loading={isSaving}>{isEdit ? "Save" : "Add Position"}</Button>
      </div>
    </div>
  );

  return (
    <Modal show onHide={isSaving ? undefined : onClose} title={isEdit ? "Edit Position" : "Add Position"}
      footer={footer} size="xl" backdrop="static" scrollable>
      <div className={styles.subtitle}>
        {[company?.comp_name, deptId ? deptNameById.get(deptId) : "Company-level"].filter(Boolean).join(" · ")}
      </div>

      <div className={styles.layout}>
        <div className={styles.form}>
          {/* 1 · The position */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>1 · The position</span>
            <div className={styles.grid2}>
              <div>
                <label className="form-label mb-1" htmlFor="position-name">Position name</label>
                <Input id="position-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. IT Lead" autoFocus />
              </div>
              <div>
                <label className="form-label mb-1" htmlFor="position-dept">Department</label>
                <Input as="select" id="position-dept" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                  <option value="">Company-level (no department)</option>
                  {(departments || []).map((dept) => (
                    <option key={String(dept.dept_id)} value={String(dept.dept_id)}>{dept.dept_name}</option>
                  ))}
                </Input>
              </div>
            </div>
            <div>
              <span className="form-label mb-1 d-block">Branch</span>
              <div className={styles.chips} role="group" aria-label="Branch">
                <button type="button" aria-pressed={!branch.trim() && !typingBranch}
                  className={`${styles.chip} ${!branch.trim() && !typingBranch ? styles.chipOn : ""}`}
                  onClick={() => pickBranch("")}>All branches</button>
                {knownBranches.map((b) => (
                  <button key={b} type="button" aria-pressed={branch.trim() === b}
                    className={`${styles.chip} ${branch.trim() === b ? styles.chipOn : ""}`} onClick={() => pickBranch(b)}>{b}</button>
                ))}
                {isCustomBranch && !typingBranch ? (
                  <button type="button" aria-pressed="true" className={`${styles.chip} ${styles.chipOn}`}
                    onClick={() => setTypingBranch(true)}>{branch.trim()}</button>
                ) : null}
                {typingBranch ? (
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} onBlur={() => setTypingBranch(false)}
                    placeholder="Branch name" aria-label="New branch name" className={styles.branchInput} autoFocus />
                ) : (
                  <button type="button" className={`${styles.chip} ${styles.chipDashed}`}
                    onClick={() => { setBranch(""); setTypingBranch(true); }}>+ Other branch</button>
                )}
              </div>
            </div>
          </section>

          {/* 2 · Rank */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>2 · Rank</span>
            <div className={styles.segmented} role="group" aria-label="Rank">
              {rankOptions.length === 0 ? (
                <span className={styles.hint}>No ranks yet. Add them with the Ranks button on Organization Setup.</span>
              ) : rankOptions.map((rank) => {
                const on = String(rank.rank_id) === String(chartLevel);
                return (
                  <button key={String(rank.rank_id)} type="button" aria-pressed={on}
                    className={`${styles.segment} ${on ? styles.segmentOn : ""}`}
                    onClick={() => setChartLevel(String(rank.rank_id))}>
                    {rank.rank_name}{rank.is_active ? "" : " (disabled)"}
                  </button>
                );
              })}
            </div>
            <span className={styles.hint}>Rank sorts positions in lists and on the chart. Who sits above whom comes from &quot;Reports to&quot;.</span>
          </section>

          {/* 3 · Reports to */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>3 · Reports to</span>
            {managers.length ? (
              <div className={styles.chips}>
                {managers.map((m) => (
                  <span key={String(m.position_id)} className={styles.tag}>
                    {m.position_name}<span className={styles.tagMuted}> · {peopleOf(m) || "Open"}</span>
                    <button type="button" className={styles.tagRemove} aria-label={`Remove ${m.position_name}`}
                      onClick={() => toggleReport(String(m.position_id))}>×</button>
                  </span>
                ))}
              </div>
            ) : (
              <span className={styles.hint}>Nobody yet. This position will be at the top of the chart.</span>
            )}
            <div className={styles.listBox}>
              <label className={styles.searchRow}>
                <SearchIcon />
                <input type="search" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Search positions or people" aria-label="Search positions or people" />
              </label>
              <div className={styles.listScroll}>
                {reportGroups.length === 0 ? (
                  <div className={styles.empty}>{otherPositions.length ? "No matches." : "No other positions in this company yet."}</div>
                ) : reportGroups.map((group) => (
                  <div key={group.key || "company-level"}>
                    <div className={styles.groupLabel}>{group.name}</div>
                    {group.items.map((p) => {
                      const id = String(p.position_id);
                      const on = reportsTo.includes(id);
                      const people = peopleOf(p);
                      return (
                        <label key={id} className={`${styles.checkRow} ${on ? styles.checkRowOn : ""}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleReport(id)} />
                          <span className={styles.checkName}>{p.position_name}{p.branch && !isAllBranch(p.branch) ? ` (${p.branch})` : ""}</span>
                          <span className={`${styles.checkPeople} ${people ? "" : styles.italic}`}>{people || "Open"}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 4 · People */}
          <section className={styles.section}>
            <span className={styles.sectionLabel}>4 · People in this position</span>
            {holderRows.length ? (
              <div className={styles.people}>
                {holderRows.map((row) => (
                  <div key={row.id} className={styles.personRow}>
                    <span className={styles.avatar} aria-hidden="true">{initialsOf(row.name)}</span>
                    <span className={styles.personName}>{row.name}</span>
                    {row.isMain ? <span className={styles.mainSeat}>★ Main seat</span> : null}
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeHolder(row.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            ) : (
              <span className={styles.hint}>Nobody yet. Leave it empty for an open position.</span>
            )}
            <div className={styles.addPerson}>
              <label className={styles.searchRow}>
                <SearchIcon />
                <input type="search" value={personSearch} onChange={(e) => setPersonSearch(e.target.value)}
                  placeholder="Add a person: type a name, username or email" aria-label="Add a person" />
              </label>
              {personSearch.trim() ? (
                <div className={styles.matches}>
                  {personMatches.length === 0 ? <div className={styles.empty}>No one matches.</div> : personMatches.map((user) => {
                    const seats = seatNamesByUser.get(String(user.user_id)) || [];
                    return (
                      <button key={String(user.user_id)} type="button" className={styles.matchRow}
                        onClick={() => { addHolder(user); setPersonSearch(""); }}>
                        <span className={`${styles.avatar} ${styles.avatarMuted}`} aria-hidden="true">{initialsOf(user.full_name)}</span>
                        <span className={styles.matchText}>
                          <span className={styles.personName}>{user.full_name}</span>
                          <span className={styles.hint}>{[user.email, seats.length ? `now ${seats.join(", ")}` : ""].filter(Boolean).join(" · ")}</span>
                        </span>
                        <span className={styles.matchAdd}>Add</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* Preview */}
        <aside className={styles.preview} aria-label="Preview on the chart">
          <span className={styles.sectionLabel}>On the chart</span>
          <div className={styles.previewBox}>
            {managers.length ? managers.map((m) => (
              <PreviewCard key={String(m.position_id)} title={peopleOf(m) || "Open position"} subtitle={m.position_name} vacant={!peopleOf(m)} />
            )) : <span className={styles.previewNote}>Top of the chart</span>}
            <span className={styles.previewLine} aria-hidden="true" />
            <PreviewCard current title={previewPeople || "Open position"}
              subtitle={`${name.trim() || "New position"} · this position`} vacant={!previewPeople} />
            <span className={styles.previewLine} aria-hidden="true" />
            {directReports.length ? directReports.map((r) => (
              <PreviewCard key={String(r.position_id)} title={peopleOf(r) || "Open position"} subtitle={r.position_name} vacant={!peopleOf(r)} />
            )) : <span className={styles.previewNote}>Positions that report here show below</span>}
          </div>
          <span className={styles.hint}>Updates as you fill in the form, so you can see where it lands before you save.</span>
        </aside>
      </div>
    </Modal>
  );
}
