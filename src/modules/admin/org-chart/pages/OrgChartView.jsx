"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/shared/components/ui";
import styles from "./OrgChartView.module.css";
import companyDepartmentSetupModule from "@/modules/admin/company-department-setup/index.js";

const ORG_SETUP_PATH = companyDepartmentSetupModule?.routes?.[0]?.path || "";

const COMPANY_LEVEL = "company-level";
// Company-level positions (Company Head, etc.) are amber; departments take the next colors in name order.
const COMPANY_LEVEL_COLOR = { dot: "#b45309", bg: "#fef3c7", fg: "#92400e" };
const DEPT_COLORS = [
  { dot: "#2563eb", bg: "#dbeafe", fg: "#1e40af" },
  { dot: "#7c3aed", bg: "#ede9fe", fg: "#5b21b6" },
  { dot: "#0f766e", bg: "#ccfbf1", fg: "#115e59" },
  { dot: "#be123c", bg: "#ffe4e6", fg: "#9f1239" },
  { dot: "#15803d", bg: "#dcfce7", fg: "#166534" },
  { dot: "#c2410c", bg: "#ffedd5", fg: "#9a3412" },
  { dot: "#4f46e5", bg: "#e0e7ff", fg: "#3730a3" },
  { dot: "#0e7490", bg: "#cffafe", fg: "#155e75" },
];
const NEUTRAL_COLOR = { dot: "#475569", bg: "#f1f5f9", fg: "#334155" };
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function deptKeyOf(position) {
  return position?.dept_id == null ? COMPANY_LEVEL : String(position.dept_id);
}

function companyShortName(company) {
  return company?.short_name || company?.comp_name || "";
}

// Each position sits under its first manager on screen (highest on the chart);
// any other managers show as "Also reports to". A position whose managers are
// all hidden (e.g. by the branch filter) starts its own tree.
function buildTree(positions) {
  const byId = new Map(positions.map((p) => [String(p.position_id), p]));
  const orderOf = new Map(positions.map((p, i) => [String(p.position_id), i]));
  const childrenOf = new Map();
  const roots = [];
  positions.forEach((p) => {
    const managers = (p.reports_to_ids || []).map(String).filter((id) => byId.has(id))
      .sort((a, b) => orderOf.get(a) - orderOf.get(b));
    const node = { position: p, also: managers.slice(1).map((id) => byId.get(id)) };
    if (managers.length) childrenOf.set(managers[0], [...(childrenOf.get(managers[0]) || []), node]);
    else roots.push(node);
  });
  const attach = (node, seen) => {
    const id = String(node.position.position_id);
    if (seen.has(id)) return { ...node, children: [] };
    const nextSeen = new Set(seen).add(id);
    return { ...node, children: (childrenOf.get(id) || []).map((child) => attach(child, nextSeen)) };
  };
  return roots.map((root) => attach(root, new Set()));
}

function parentIdsOf(nodes, out = []) {
  nodes.forEach((n) => {
    if (n.children.length) {
      out.push(String(n.position.position_id));
      parentIdsOf(n.children, out);
    }
  });
  return out;
}

function VacantIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

export default function OrgChartView({
  companies = [], positions = [], initialCompanyId = null,
  focusMe = false, currentUserId = null, canEdit = false,
}) {
  const mySeat = useMemo(() => {
    if (!focusMe || currentUserId == null) return null;
    const isMe = (person) => String(person.user_id) === String(currentUserId);
    const mine = positions.filter((p) => (p.people || []).some(isMe));
    const position = mine.find((p) => p.people.some((person) => isMe(person) && person.is_primary)) || mine[0];
    return position ? { positionId: position.position_id, userId: currentUserId, compId: position.comp_id } : null;
  }, [currentUserId, focusMe, positions]);

  const startId = mySeat && companies.some((c) => String(c.comp_id) === String(mySeat.compId))
    ? String(mySeat.compId)
    : companies.some((c) => String(c.comp_id) === String(initialCompanyId))
      ? String(initialCompanyId)
      : String(companies[0]?.comp_id ?? "");
  const [companyId, setCompanyId] = useState(startId);
  const [branch, setBranch] = useState("");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null); // { positionId, userId }
  const viewportRef = useRef(null);
  const treeRef = useRef(null);

  const positionById = useMemo(() => new Map(positions.map((p) => [String(p.position_id), p])), [positions]);
  const companyById = useMemo(() => new Map(companies.map((c) => [String(c.comp_id), c])), [companies]);
  const countByCompany = useMemo(() => {
    const counts = new Map();
    positions.forEach((p) => counts.set(String(p.comp_id), (counts.get(String(p.comp_id)) || 0) + 1));
    return counts;
  }, [positions]);

  const companyPositions = useMemo(
    () => positions.filter((p) => String(p.comp_id) === companyId), [positions, companyId]);
  const branches = useMemo(
    () => [...new Set(companyPositions.map((p) => p.branch).filter(Boolean))].sort(), [companyPositions]);
  const visiblePositions = useMemo(
    () => companyPositions.filter((p) => !branch || !p.branch || p.branch === branch), [companyPositions, branch]);
  const tree = useMemo(() => buildTree(visiblePositions), [visiblePositions]);

  const colors = useMemo(() => {
    const map = new Map([[COMPANY_LEVEL, COMPANY_LEVEL_COLOR]]);
    const depts = [...new Map(companyPositions.filter((p) => p.dept_id != null)
      .map((p) => [String(p.dept_id), p.department_name])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    depts.forEach(([id], i) => map.set(id, DEPT_COLORS[i % DEPT_COLORS.length]));
    return {
      map,
      legend: depts.map(([id, name]) => ({ id, name, color: map.get(id) })),
      hasCompanyLevel: companyPositions.some((p) => p.dept_id == null),
    };
  }, [companyPositions]);
  const colorOf = (p) => (String(p?.comp_id) === companyId ? colors.map.get(deptKeyOf(p)) : null) || NEUTRAL_COLOR;

  const q = query.trim().toLowerCase();
  const matches = (p) => !q || [p.position_name, p.department_name, ...p.people.map((x) => x.full_name)]
    .some((v) => String(v || "").toLowerCase().includes(q));

  useEffect(() => {
    if (!focusMe || !mySeat) return;
    setCompanyId(String(mySeat.compId));
    setSelected({ positionId: mySeat.positionId, userId: mySeat.userId });
    setCollapsed(new Set());
  }, [focusMe, mySeat]);

  useEffect(() => {
    if (!selected || !selected.positionId) return;
    const element = document.querySelector(`[data-position-id="${String(selected.positionId)}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  const chooseCompany = (id) => {
    setCompanyId(String(id)); setBranch(""); setCollapsed(new Set()); setSelected(null);
  };
  const selectSeat = (position, userId) => {
    if (String(position.comp_id) !== companyId) chooseCompany(position.comp_id);
    setSelected({ positionId: position.position_id, userId: userId ?? null });
  };
  const toggleCollapsed = (positionId) => setCollapsed((prev) => {
    const next = new Set(prev);
    const key = String(positionId);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const changeZoom = (delta) => setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 10) / 10)));
  const fitToScreen = useCallback(() => {
    const box = viewportRef.current, el = treeRef.current;
    if (!box || !el) return;
    const rect = el.getBoundingClientRect();
    const naturalW = rect.width / zoom, naturalH = rect.height / zoom;
    if (!naturalW || !naturalH) return;
    const next = Math.min(1, (box.clientWidth - 48) / naturalW, (box.clientHeight - 96) / naturalH);
    setZoom(Math.max(ZOOM_MIN, Math.floor(next * 100) / 100));
  }, [zoom]);

  // ── Details panel ──
  const selectedPosition = selected ? positionById.get(String(selected.positionId)) || null : null;
  const selectedPerson = selectedPosition?.people.find((x) => String(x.user_id) === String(selected?.userId)) || null;
  const managers = selectedPosition
    ? (selectedPosition.reports_to_ids || []).map((id) => positionById.get(String(id))).filter(Boolean) : [];
  const directReports = selectedPosition
    ? positions.filter((p) => (p.reports_to_ids || []).some((id) => String(id) === String(selectedPosition.position_id))) : [];
  const coHolders = selectedPosition && selectedPerson
    ? selectedPosition.people.filter((x) => String(x.user_id) !== String(selectedPerson.user_id)) : [];
  const otherSeats = selectedPerson
    ? positions.filter((p) => String(p.position_id) !== String(selectedPosition.position_id)
      && p.people.some((x) => String(x.user_id) === String(selectedPerson.user_id))) : [];
  const rowsFor = (p) => (p.people.length
    ? p.people.map((person) => ({ key: `${p.position_id}-${person.user_id}`, position: p, person }))
    : [{ key: `${p.position_id}-open`, position: p, person: null }]);

  const renderPanelList = (title, rows, emptyText, showCompany = false) => (
    <div className={styles.panelSection}>
      <span className={styles.panelLabel}>{title}</span>
      {rows.length === 0 ? <span className={styles.panelMuted}>{emptyText}</span> : rows.map((row) => {
        const color = colorOf(row.position);
        const company = companyById.get(String(row.position.comp_id));
        return (
          <button key={row.key} type="button" className={styles.panelRow} onClick={() => selectSeat(row.position, row.person?.user_id)}>
            {row.person ? (
              <span className={styles.avatarSmall} style={{ background: color.dot }} aria-hidden="true">{initialsOf(row.person.full_name)}</span>
            ) : (
              <span className={`${styles.avatarSmall} ${styles.avatarVacant}`}><VacantIcon size={14} /></span>
            )}
            <span className={styles.panelRowText}>
              <span className={styles.panelRowName}>{row.person ? row.person.full_name : "Open position"}</span>
              <span className={styles.panelMuted}>
                {showCompany ? `${companyShortName(company)} · ` : ""}{row.position.position_name}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );

  // ── Tree ──
  const renderCard = (node) => {
    const p = node.position;
    const color = colorOf(p);
    const people = p.people;
    const single = people.length === 1 ? people[0] : null;
    const isSelected = selectedPosition && String(selectedPosition.position_id) === String(p.position_id);
    const childCount = node.children.length;
    const isCollapsed = !q && collapsed.has(String(p.position_id));
    const cls = [
      styles.card,
      people.length === 0 ? styles.cardVacant : "",
      isSelected ? styles.cardSelected : "",
      q && !matches(p) ? styles.cardDim : "",
      q && matches(p) ? styles.cardMatch : "",
    ].filter(Boolean).join(" ");

    return (
      <div className={cls} data-position-id={String(p.position_id)}>
        {people.length <= 1 ? (
          <button type="button" className={styles.cardMain} onClick={() => selectSeat(p, single?.user_id)}>
            {single ? (
              <span className={styles.avatar} style={{ background: color.dot }} aria-hidden="true">{initialsOf(single.full_name)}</span>
            ) : (
              <span className={`${styles.avatar} ${styles.avatarVacant}`}><VacantIcon /></span>
            )}
            <span className={styles.cardText}>
              <span className={single ? styles.cardName : `${styles.cardName} ${styles.cardNameVacant}`}>
                {single ? single.full_name : "Open position"}
              </span>
              <span className={styles.cardRole}>{p.position_name}</span>
            </span>
          </button>
        ) : (
          <div className={styles.cardGroup}>
            <span className={styles.cardRole}><strong>{p.position_name}</strong> · {people.length} people</span>
            {people.map((person) => {
              const on = isSelected && String(selected?.userId) === String(person.user_id);
              return (
                <button key={String(person.user_id)} type="button"
                  className={`${styles.personRow} ${on ? styles.personRowOn : ""}`} onClick={() => selectSeat(p, person.user_id)}>
                  <span className={styles.avatarSmall} style={{ background: color.dot }} aria-hidden="true">{initialsOf(person.full_name)}</span>
                  <span className={styles.personName}>{person.full_name}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className={styles.cardFoot}>
          <span className={styles.chip} style={{ background: color.bg, color: color.fg }}>
            {p.department_name || "Company-level"}{p.branch ? ` · ${p.branch}` : ""}
          </span>
          {childCount > 0 ? (
            <button type="button" className={styles.toggle} aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(p.position_id)}>
              {childCount} {childCount === 1 ? "report" : "reports"} {isCollapsed ? "▸" : "▾"}
            </button>
          ) : null}
        </div>
        {node.also.length ? (
          <span className={styles.alsoTag}>Also reports to {node.also.map((m) => m.position_name).join(", ")}</span>
        ) : null}
      </div>
    );
  };

  const renderLevel = (nodes, isRoot = false) => (
    <ul className={isRoot ? styles.rootList : undefined}>
      {nodes.map((node) => {
        const showChildren = node.children.length > 0 && (q || !collapsed.has(String(node.position.position_id)));
        return (
          <li key={String(node.position.position_id)}>
            {renderCard(node)}
            {showChildren ? renderLevel(node.children) : null}
          </li>
        );
      })}
    </ul>
  );

  const allParentIds = useMemo(() => parentIdsOf(tree), [tree]);
  const panelColor = selectedPosition ? colorOf(selectedPosition) : NEUTRAL_COLOR;

  return (
    <main className="container-fluid py-3 px-3 px-lg-4">
      <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Org Chart</h1>
          <p className="text-muted mb-0">Who reports to whom. Click a person to see their details.</p>
        </div>
        {canEdit ? (
          <Link href={companyId ? `${ORG_SETUP_PATH}?company=${companyId}` : ORG_SETUP_PATH}
            className="btn btn-sm btn-outline-primary">Edit in Organization Setup</Link>
        ) : null}
      </div>

      {companies.length === 0 ? (
        <div className={styles.emptyBox}>No active companies.</div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <div className={styles.segmented} role="group" aria-label="Company">
              {companies.map((c) => {
                const on = String(c.comp_id) === companyId;
                return (
                  <button key={String(c.comp_id)} type="button" aria-pressed={on} title={c.comp_name}
                    className={`${styles.segment} ${on ? styles.segmentOn : ""}`} onClick={() => chooseCompany(c.comp_id)}>
                    {companyShortName(c)} <span className={styles.segmentCount}>· {countByCompany.get(String(c.comp_id)) || 0}</span>
                  </button>
                );
              })}
            </div>

            {branches.length ? (
              <div className={styles.pills} role="group" aria-label="Branch">
                <span className={styles.toolbarLabel}>Branch</span>
                {["", ...branches].map((b) => (
                  <button key={b || "all"} type="button" aria-pressed={branch === b}
                    className={`${styles.pill} ${branch === b ? styles.pillOn : ""}`} onClick={() => setBranch(b)}>{b || "All"}</button>
                ))}
              </div>
            ) : null}

            <label className={styles.search}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a person or position" aria-label="Find a person or position" />
            </label>

            {colors.legend.length || colors.hasCompanyLevel ? (
              <div className={styles.legend}>
                {colors.hasCompanyLevel ? (
                  <span className={styles.chip} style={{ background: COMPANY_LEVEL_COLOR.bg, color: COMPANY_LEVEL_COLOR.fg }}>
                    <span className={styles.dot} style={{ background: COMPANY_LEVEL_COLOR.dot }} />Company-level
                  </span>
                ) : null}
                {colors.legend.map((d) => (
                  <span key={d.id} className={styles.chip} style={{ background: d.color.bg, color: d.color.fg }}>
                    <span className={styles.dot} style={{ background: d.color.dot }} />{d.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className={styles.body}>
            <section className={styles.chartBox} aria-label="Chart">
              <div ref={viewportRef} className={styles.viewport}>
                {tree.length ? (
                  <div ref={treeRef} className={styles.tree} style={{ zoom }}>{renderLevel(tree, true)}</div>
                ) : (
                  <div className={styles.emptyBox}>No positions yet for this company. Add them in Organization Setup.</div>
                )}
              </div>
              <div className={styles.cornerLeft}>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCollapsed(new Set())}>Expand all</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setCollapsed(new Set(allParentIds))}>Collapse all</Button>
              </div>
              <div className={styles.zoomBox} role="group" aria-label="Zoom">
                <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => changeZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>+</button>
                <span className={styles.zoomDivider} aria-hidden="true" />
                <button type="button" onClick={fitToScreen}>Fit</button>
              </div>
            </section>

            <aside className={styles.panel} aria-label="Details">
              {!selectedPosition ? (
                <div className={styles.panelEmpty}>
                  {focusMe && currentUserId != null && !mySeat
                    ? "You are not assigned to any active seat yet."
                    : "Click a person on the chart to see who they report to and who reports to them."}
                </div>
              ) : (
                <>
                  <div className={styles.panelHead}>
                    {selectedPerson ? (
                      <span className={styles.avatarLarge} style={{ background: panelColor.dot }} aria-hidden="true">{initialsOf(selectedPerson.full_name)}</span>
                    ) : (
                      <span className={`${styles.avatarLarge} ${styles.avatarVacant}`}><VacantIcon size={26} /></span>
                    )}
                    <div className={styles.panelName}>{selectedPerson ? selectedPerson.full_name : "Open position"}</div>
                    <div className={styles.panelRole}>{selectedPosition.position_name}</div>
                    <div className={styles.panelChips}>
                      <span className={styles.chip} style={{ background: panelColor.bg, color: panelColor.fg }}>
                        {selectedPosition.department_name || "Company-level"}
                      </span>
                      <span className={styles.chip} style={{ background: NEUTRAL_COLOR.bg, color: NEUTRAL_COLOR.fg }}>
                        {selectedPosition.branch || "All branches"}
                      </span>
                      {selectedPerson?.is_primary ? <span className={styles.mainSeat}>★ Main seat</span> : null}
                    </div>
                    {selectedPerson?.email ? <a className={styles.panelEmail} href={`mailto:${selectedPerson.email}`}>{selectedPerson.email}</a> : null}
                  </div>
                  <div className={styles.panelBody}>
                    {renderPanelList("Reports to", managers.flatMap(rowsFor), "Nobody — top of the chart")}
                    {renderPanelList(`Direct reports · ${directReports.length}`, directReports.flatMap(rowsFor), "None")}
                    {coHolders.length ? renderPanelList("Also in this position",
                      coHolders.map((person) => ({ key: `co-${person.user_id}`, position: selectedPosition, person })), "") : null}
                    {selectedPerson ? renderPanelList("Other seats",
                      otherSeats.map((p) => ({ key: `seat-${p.position_id}`, position: p, person: selectedPerson })), "None", true) : null}
                  </div>
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
