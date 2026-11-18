"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
const WHEEL_ZOOM_FACTOR = 1.1;
const DRAG_THRESHOLD_PX = 5;
const CARD_WIDTH = 236; // same as .card width in OrgChartView.module.css
const COLUMN_GAP = 28;
const ROW_GAP = 64;
const ELBOW = 28; // a line turns this far above the card it goes into
const CORNER = 10;
const DEFAULT_CARD_HEIGHT = 112; // used until the real height is measured
const LAYOUT_PASSES = 8;
const LANE_SPACING = 14; // a boss whose sideways line would overlap another's runs this much higher

function initialsOf(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

function deptKeyOf(position) {
  return position?.dept_id == null ? COMPANY_LEVEL : String(position.dept_id);
}

function companyShortName(company) {
  return company?.short_name || company?.comp_name || "";
}

// Bosses and reports among the shown positions. A boss that is not shown
// (e.g. hidden by the branch filter) is dropped, so that position starts a new top.
function buildGraph(positions) {
  const byId = new Map(positions.map((p) => [String(p.position_id), p]));
  const orderOf = new Map(positions.map((p, i) => [String(p.position_id), i]));
  const managersOf = new Map();
  const reportsOf = new Map(positions.map((p) => [String(p.position_id), []]));
  positions.forEach((p) => {
    const id = String(p.position_id);
    const managers = [...new Set((p.reports_to_ids || []).map(String))]
      .filter((m) => byId.has(m) && m !== id)
      .sort((a, b) => orderOf.get(a) - orderOf.get(b));
    managersOf.set(id, managers);
    managers.forEach((m) => reportsOf.get(m).push(id));
  });
  return { byId, managersOf, reportsOf };
}

// Positions for one row, in this order, as close to `wanted` as possible and at
// least `gap` apart (pool-adjacent-violators on wanted[i] - i * gap).
function placeInRow(wanted, gap) {
  const blocks = [];
  wanted.forEach((w, i) => {
    let block = { start: i, count: 1, sum: w - i * gap };
    while (blocks.length) {
      const last = blocks[blocks.length - 1];
      if (last.sum / last.count <= block.sum / block.count) break;
      blocks.pop();
      block = { start: last.start, count: last.count + block.count, sum: last.sum + block.sum };
    }
    blocks.push(block);
  });
  const placed = [];
  blocks.forEach((b) => {
    for (let k = 0; k < b.count; k += 1) placed.push(b.sum / b.count + (b.start + k) * gap);
  });
  return placed;
}

// Down from the boss, across, then down into the card, with rounded corners.
function elbowPath(x1, y1, x2, y2, turnY) {
  if (Math.abs(x2 - x1) < 1) return `M ${x1} ${y1} V ${y2}`;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(CORNER, Math.abs(x2 - x1) / 2, Math.max(0, turnY - y1));
  return `M ${x1} ${y1} V ${turnY - r} Q ${x1} ${turnY} ${x1 + dir * r} ${turnY}`
    + ` H ${x2 - dir * r} Q ${x2} ${turnY} ${x2} ${turnY + r} V ${y2}`;
}

/**
 * Org-chart layout. A position sits one row below its lowest shown boss and is
 * pulled to the middle of all its bosses (bosses to the middle of their
 * reports), so a position with two bosses lands between them. Collapsed
 * positions hide their reports unless showAll; a report that still has an
 * expanded boss stays shown.
 * heights: Map(position id → measured card height).
 * Returns { nodes: [{ id, position, reportCount, x, y }], lines: [{ key, d }], width, height }.
 */
function layoutChart(graph, collapsed, showAll, heights) {
  const { byId, managersOf, reportsOf } = graph;
  const isOpen = (id) => showAll || !collapsed.has(id);

  // Shown positions in family order: each top, then everything under it.
  const shown = new Set();
  const ordered = [];
  const visit = (id) => {
    if (shown.has(id)) return;
    shown.add(id);
    ordered.push(id);
    if (isOpen(id)) reportsOf.get(id).forEach(visit);
  };
  [...byId.keys()].filter((id) => managersOf.get(id).length === 0).forEach(visit);
  if (!ordered.length) return { nodes: [], lines: [], width: 0, height: 0 };

  const bossesOf = (id) => managersOf.get(id).filter((m) => shown.has(m) && isOpen(m));
  const reportsShown = (id) => (isOpen(id) ? reportsOf.get(id).filter((r) => shown.has(r)) : []);
  const heightOf = (id) => heights.get(id) ?? DEFAULT_CARD_HEIGHT;

  // Rows: one below the lowest boss.
  const rowById = new Map();
  const rowOf = (id, path = new Set()) => {
    if (rowById.has(id)) return rowById.get(id);
    if (path.has(id)) return 0; // safety against a reporting loop
    path.add(id);
    const bosses = bossesOf(id);
    const row = bosses.length ? 1 + Math.max(...bosses.map((m) => rowOf(m, path))) : 0;
    path.delete(id);
    rowById.set(id, row);
    return row;
  };
  const rows = [];
  ordered.forEach((id) => {
    const r = rowOf(id);
    if (!rows[r]) rows[r] = [];
    rows[r].push(id);
  });

  // Columns: settle each row toward its bosses (going down), then toward its reports (going up).
  const step = CARD_WIDTH + COLUMN_GAP;
  const x = new Map();
  rows.forEach((ids) => ids.forEach((id, i) => x.set(id, i * step)));
  const middleOf = (ids) => ids.reduce((sum, id) => sum + x.get(id), 0) / ids.length;
  const settle = (ids, linkedTo) => {
    const items = ids.map((id, i) => {
      const linked = linkedTo(id);
      return { id, i, wanted: linked.length ? middleOf(linked) : x.get(id) };
    }).sort((a, b) => a.wanted - b.wanted || a.i - b.i);
    const placed = placeInRow(items.map((it) => it.wanted), step);
    items.forEach((it, k) => x.set(it.id, placed[k]));
    return items.map((it) => it.id);
  };
  for (let pass = 0; pass < LAYOUT_PASSES; pass += 1) {
    for (let r = 1; r < rows.length; r += 1) rows[r] = settle(rows[r], bossesOf);
    for (let r = rows.length - 2; r >= 0; r -= 1) rows[r] = settle(rows[r], reportsShown);
  }
  const minX = Math.min(...x.values());

  // A card with several bosses gets one entry point per boss across its top
  // edge, left to right like the bosses, so their lines never meet.
  const entryX = new Map(); // `${bossId}>${childId}` → x
  ordered.forEach((id) => {
    const bosses = bossesOf(id).sort((a, b) => x.get(a) - x.get(b));
    bosses.forEach((bossId, i) => {
      entryX.set(`${bossId}>${id}`, x.get(id) + (CARD_WIDTH * (i + 1)) / (bosses.length + 1));
    });
  });

  // Each boss's lines into a row share one lane. Bosses whose sideways lines
  // would overlap get separate lanes (a step higher), so one boss's line never
  // looks like it reaches another boss's reports.
  const laneOf = new Map(); // `${bossId}>${row}` → lane (0 = lowest)
  const lanesInRow = rows.map(() => 1);
  rows.forEach((ids, r) => {
    const spans = new Map(); // bossId → [from, to]
    ids.forEach((id) => bossesOf(id).forEach((bossId) => {
      const bossMiddle = x.get(bossId) + CARD_WIDTH / 2;
      const entry = entryX.get(`${bossId}>${id}`);
      const span = spans.get(bossId) || [bossMiddle, bossMiddle];
      spans.set(bossId, [Math.min(span[0], entry), Math.max(span[1], entry)]);
    }));
    const laneEnds = []; // right end of the last span on each lane
    [...spans.entries()].sort((a, b) => a[1][0] - b[1][0]).forEach(([bossId, [from, to]]) => {
      let lane = laneEnds.findIndex((end) => from > end + LANE_SPACING);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(to);
      } else {
        laneEnds[lane] = to;
      }
      laneOf.set(`${bossId}>${r}`, lane);
    });
    lanesInRow[r] = Math.max(1, laneEnds.length);
  });

  // Rows go down by the tallest card in each row, plus room for extra lanes above a row.
  const rowTop = [];
  let top = 0;
  rows.forEach((ids, r) => {
    if (r > 0) top += (lanesInRow[r] - 1) * LANE_SPACING;
    rowTop[r] = top;
    top += Math.max(...ids.map(heightOf)) + ROW_GAP;
  });

  const nodes = ordered.map((id) => ({
    id,
    position: byId.get(id),
    reportCount: reportsOf.get(id).length,
    x: x.get(id) - minX,
    y: rowTop[rowById.get(id)],
  }));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const lines = [];
  nodes.forEach((child) => bossesOf(child.id).forEach((bossId) => {
    const boss = nodeById.get(bossId);
    const lane = laneOf.get(`${bossId}>${rowById.get(child.id)}`) || 0;
    lines.push({
      key: `${bossId}-${child.id}`,
      d: elbowPath(
        boss.x + CARD_WIDTH / 2, boss.y + heightOf(bossId),
        entryX.get(`${bossId}>${child.id}`) - minX, child.y,
        child.y - ELBOW - lane * LANE_SPACING,
      ),
    });
  }));

  return {
    nodes,
    lines,
    width: Math.max(...nodes.map((n) => n.x)) + CARD_WIDTH,
    height: top - ROW_GAP,
  };
}

function clampZoom(value) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
}

// Position of el inside root in chart units (ignores the zoom/pan transform).
function offsetIn(el, root) {
  let x = 0;
  let y = 0;
  let node = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent;
  }
  return node === root ? { x, y } : null;
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
  // Pan (x, y in screen px) and zoom of the chart inside the viewport.
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const zoom = view.zoom;
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef(null); // { startX, startY, x, y, moved, pointerId }
  const [cardHeights, setCardHeights] = useState(() => new Map());
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
  const graph = useMemo(() => buildGraph(visiblePositions), [visiblePositions]);

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
  const matches = (p) => !q || [p.position_name, p.position_code, p.department_name, p.department_code, ...p.people.map((x) => x.full_name)]
    .some((v) => String(v || "").toLowerCase().includes(q));

  useEffect(() => {
    if (!focusMe || !mySeat) return;
    setCompanyId(String(mySeat.compId));
    setSelected({ positionId: mySeat.positionId, userId: mySeat.userId });
    setCollapsed(new Set());
  }, [focusMe, mySeat]);

  // Move the chart so the picked card is in view (only when it is outside it).
  useEffect(() => {
    if (!selected || !selected.positionId) return;
    const box = viewportRef.current, el = treeRef.current;
    const card = el?.querySelector(`[data-position-id="${String(selected.positionId)}"]`);
    if (!box || !card) return;
    const boxRect = box.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const inView = cardRect.left >= boxRect.left && cardRect.right <= boxRect.right
      && cardRect.top >= boxRect.top && cardRect.bottom <= boxRect.bottom;
    if (inView) return;
    const at = offsetIn(card, el);
    if (!at) return;
    setView((v) => ({
      ...v,
      x: box.clientWidth / 2 - (at.x + card.offsetWidth / 2) * v.zoom,
      y: box.clientHeight / 2 - (at.y + card.offsetHeight / 2) * v.zoom,
    }));
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

  // Place the chart at a zoom level: centered across, near the top.
  const placeAt = useCallback((nextZoom) => {
    const box = viewportRef.current, el = treeRef.current;
    if (!box || !el) return;
    const z = clampZoom(nextZoom);
    setView({ zoom: z, x: Math.max(24, (box.clientWidth - el.offsetWidth * z) / 2), y: 28 });
  }, []);

  // Zoom while keeping the chart point under (px, py) — viewport px — in place.
  const zoomAt = useCallback((nextZoom, px, py) => setView((v) => {
    const z = clampZoom(typeof nextZoom === "function" ? nextZoom(v.zoom) : nextZoom);
    if (z === v.zoom) return v;
    return { zoom: z, x: px - ((px - v.x) / v.zoom) * z, y: py - ((py - v.y) / v.zoom) * z };
  }), []);

  const changeZoom = (delta) => {
    const box = viewportRef.current;
    if (!box) return;
    zoomAt((z) => Math.round((z + delta) * 10) / 10, box.clientWidth / 2, box.clientHeight / 2);
  };
  const fitToScreen = useCallback(() => {
    const box = viewportRef.current, el = treeRef.current;
    if (!box || !el || !el.offsetWidth || !el.offsetHeight) return;
    placeAt(Math.floor(Math.min(1, (box.clientWidth - 48) / el.offsetWidth, (box.clientHeight - 96) / el.offsetHeight) * 100) / 100);
  }, [placeAt]);

  // New company or branch: start at 100%, centered.
  useLayoutEffect(() => { placeAt(1); }, [companyId, branch, placeAt]);

  // Mouse wheel zooms toward the pointer. Added by hand: React's onWheel is passive and can't stop the page scrolling.
  useEffect(() => {
    const box = viewportRef.current;
    if (!box) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = box.getBoundingClientRect();
      zoomAt((z) => z * (e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR), e.clientX - rect.left, e.clientY - rect.top);
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [zoomAt, companies.length]);

  // Drag anywhere to move the chart. A press that moves less than DRAG_THRESHOLD_PX is a normal click.
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, x: view.x, y: view.y, moved: false, pointerId: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
    }
    setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }));
  };
  const endDrag = (e) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (!d.moved) { dragRef.current = null; return; }
    setIsDragging(false);
    // Kept until the click that follows a drag is swallowed below.
    window.setTimeout(() => { dragRef.current = null; }, 0);
  };
  const onClickCapture = (e) => {
    if (!dragRef.current?.moved) return;
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = null;
  };

  // Where every card and line goes (search shows everything, like before).
  const layout = useMemo(
    () => layoutChart(graph, collapsed, Boolean(q), cardHeights),
    [graph, collapsed, q, cardHeights]);

  // Real card heights (several people or long names make a card taller), so rows
  // never overlap. Only stores a change, so it settles after one extra render.
  useLayoutEffect(() => {
    const el = treeRef.current;
    if (!el) return;
    let changed = false;
    const next = new Map(cardHeights);
    el.querySelectorAll("[data-position-id]").forEach((card) => {
      const id = card.getAttribute("data-position-id");
      if (next.get(id) !== card.offsetHeight) {
        next.set(id, card.offsetHeight);
        changed = true;
      }
    });
    if (changed) setCardHeights(next);
  });

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
    const childCount = node.reportCount;
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
      </div>
    );
  };

  const allParentIds = useMemo(
    () => [...graph.reportsOf.entries()].filter(([, reports]) => reports.length).map(([id]) => id),
    [graph]);
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
                placeholder="Find a person, position or code" aria-label="Find a person, position or code" />
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
              <div ref={viewportRef} className={`${styles.viewport} ${isDragging ? styles.viewportDragging : ""}`}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
                onClickCapture={onClickCapture}>
                {layout.nodes.length ? (
                  <div ref={treeRef} className={styles.tree}
                    style={{
                      width: layout.width,
                      height: layout.height,
                      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
                    }}>
                    <svg className={styles.lines} width={layout.width} height={layout.height} aria-hidden="true">
                      {layout.lines.map((line) => <path key={line.key} d={line.d} />)}
                    </svg>
                    {layout.nodes.map((node) => (
                      <div key={node.id} className={styles.node} style={{ left: node.x, top: node.y }}>
                        {renderCard(node)}
                      </div>
                    ))}
                  </div>
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
