"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { loadSection } from "../data/documentation.actions";
import AppIcon from "@/shared/components/ui/AppIcon";
import styles from "./DocumentationView.module.css";

// ---------------------------------------------------------------------------
// Markdown → HTML (lightweight, no dependencies)
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseInline(line) {
  return line
    .replace(/`([^`]+)`/g, '<code class="' + styles.inlineCode + '">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="' + styles.link + '">$1</a>');
}

function markdownToHtml(md) {
  if (!md) return "";
  const lines = md.split("\n");
  const out = [];
  let inCode = false;
  let codeLang = "";
  let codeLines = [];
  let inTable = false;
  let tableRows = [];
  let inList = false;
  let listItems = [];
  let listOrdered = false;

  function flushList() {
    if (!inList) return;
    const tag = listOrdered ? "ol" : "ul";
    out.push(`<${tag} class="${styles.list}">${listItems.join("")}</${tag}>`);
    listItems = [];
    inList = false;
  }

  function flushTable() {
    if (!inTable) return;
    if (tableRows.length === 0) { inTable = false; return; }
    const headerCells = tableRows[0];
    let html = `<div class="${styles.tableWrap}"><table class="${styles.table}"><thead><tr>`;
    for (const cell of headerCells) html += `<th>${parseInline(cell)}</th>`;
    html += "</tr></thead><tbody>";
    for (let i = 2; i < tableRows.length; i++) {
      html += "<tr>";
      for (const cell of tableRows[i]) html += `<td>${parseInline(cell)}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    out.push(html);
    tableRows = [];
    inTable = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // Fenced code blocks
    if (raw.startsWith("```")) {
      if (!inCode) {
        flushList();
        flushTable();
        inCode = true;
        codeLang = raw.slice(3).trim();
        codeLines = [];
      } else {
        out.push(
          `<div class="${styles.codeBlock}">` +
            (codeLang ? `<span class="${styles.codeLang}">${escapeHtml(codeLang)}</span>` : "") +
            `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre></div>`
        );
        inCode = false;
        codeLang = "";
      }
      continue;
    }
    if (inCode) { codeLines.push(raw); continue; }

    const trimmed = raw.trim();

    // Blank line
    if (!trimmed) { flushList(); flushTable(); continue; }

    // Table rows
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      if (!inTable) inTable = true;
      const cells = trimmed.slice(1, -1).split("|").map((c) => c.trim());
      tableRows.push(cells);
      continue;
    } else {
      flushTable();
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const anchor = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const cls = level <= 2 ? styles.heading : styles.subheading;
      out.push(`<h${level} id="${anchor}" class="${cls}">${parseInline(text)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      flushList();
      out.push(`<hr class="${styles.hr}" />`);
      continue;
    }

    // Blockquote / callout
    if (trimmed.startsWith(">")) {
      flushList();
      const content = trimmed.replace(/^>\s*/, "");
      const isWarning = /^\*\*(?:Note|Warning|Important)/i.test(content);
      const cls = isWarning ? styles.calloutWarning : styles.callout;
      out.push(`<blockquote class="${cls}">${parseInline(content)}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*]\s/.test(trimmed)) {
      if (!inList || listOrdered) { flushList(); inList = true; listOrdered = false; }
      listItems.push(`<li>${parseInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s/.test(trimmed)) {
      if (!inList || !listOrdered) { flushList(); inList = true; listOrdered = true; }
      listItems.push(`<li>${parseInline(trimmed.replace(/^\d+[.)]\s+/, ""))}</li>`);
      continue;
    }

    // Checklist
    if (/^- \[[ x]\]\s/.test(trimmed)) {
      flushList();
      const checked = trimmed.startsWith("- [x]");
      const text = trimmed.replace(/^- \[[ x]\]\s+/, "");
      out.push(
        `<div class="${styles.checkItem}">` +
          `<span class="${checked ? styles.checkDone : styles.checkOpen}">${checked ? "✓" : "○"}</span>` +
          `<span>${parseInline(text)}</span></div>`
      );
      continue;
    }

    // Paragraph
    flushList();
    out.push(`<p class="${styles.paragraph}">${parseInline(trimmed)}</p>`);
  }

  flushList();
  flushTable();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ manifest, activeSection, onSelect, collapsed, onToggle }) {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
      <div className={styles.sidebarHeader}>
        <button className={styles.collapseBtn} onClick={onToggle} title={collapsed ? "Expand" : "Collapse"}>
          <AppIcon icon={collapsed ? "chevron-right" : "chevron-left"} />
        </button>
        {!collapsed && <span className={styles.sidebarTitle}>Documentation</span>}
      </div>
      {!collapsed && (
        <nav className={styles.sidebarNav}>
          {manifest.map((chapter) => (
            <div key={chapter.id} className={styles.chapterGroup}>
              <div className={styles.chapterLabel}>
                <AppIcon icon={chapter.icon} />
                <span>{chapter.title}</span>
              </div>
              {chapter.sections.map((section) => (
                <button
                  key={section.id}
                  className={`${styles.sectionLink} ${activeSection === section.id ? styles.sectionLinkActive : ""}`}
                  onClick={() => onSelect(section.id)}
                >
                  {section.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Content area with in-page TOC
// ---------------------------------------------------------------------------

function extractHeadings(md) {
  if (!md) return [];
  const headings = [];
  for (const line of md.split("\n")) {
    const m = line.match(/^(#{2,3})\s+(.*)/);
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/[`*[\]]/g, ""),
        anchor: m[2].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
      });
    }
  }
  return headings;
}

function ContentToc({ headings, contentRef }) {
  if (headings.length < 2) return null;

  const handleClick = (e, anchor) => {
    e.preventDefault();
    const target = contentRef?.current?.querySelector(`#${CSS.escape(anchor)}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.toc}>
      <div className={styles.tocTitle}>On this page</div>
      <ul className={styles.tocList}>
        {headings.map((h, i) => (
          <li key={`${h.anchor}-${i}`} className={h.level === 3 ? styles.tocIndent : ""}>
            <a href={`#${h.anchor}`} className={styles.tocLink} onClick={(e) => handleClick(e, h.anchor)}>{h.text}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section navigation arrows
// ---------------------------------------------------------------------------

function SectionNav({ manifest, activeSectionId, onSelect }) {
  const allSections = useMemo(() => {
    const flat = [];
    for (const ch of manifest) {
      for (const s of ch.sections) {
        flat.push({ ...s, chapterTitle: ch.title });
      }
    }
    return flat;
  }, [manifest]);

  const idx = allSections.findIndex((s) => s.id === activeSectionId);
  const prev = idx > 0 ? allSections[idx - 1] : null;
  const next = idx < allSections.length - 1 ? allSections[idx + 1] : null;

  return (
    <div className={styles.sectionNav}>
      {prev ? (
        <button className={styles.navBtn} onClick={() => onSelect(prev.id)}>
          <span className={styles.navDir}>← Previous</span>
          <span className={styles.navLabel}>{prev.title}</span>
        </button>
      ) : <span />}
      {next ? (
        <button className={`${styles.navBtn} ${styles.navBtnNext}`} onClick={() => onSelect(next.id)}>
          <span className={styles.navDir}>Next →</span>
          <span className={styles.navLabel}>{next.title}</span>
        </button>
      ) : <span />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export default function DocumentationView({ manifest, initialSection }) {
  const [section, setSection] = useState(initialSection);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const contentRef = useRef(null);

  const handleSelect = useCallback(async (sectionId) => {
    if (sectionId === section?.id) return;
    setLoading(true);
    try {
      const data = await loadSection(sectionId);
      setSection(data);
    } finally {
      setLoading(false);
    }
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [section?.id]);

  const headings = useMemo(() => extractHeadings(section?.content), [section?.content]);
  const html = useMemo(() => markdownToHtml(section?.content), [section?.content]);

  return (
    <div className={styles.shell}>
      <Sidebar
        manifest={manifest}
        activeSection={section?.id}
        onSelect={handleSelect}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main className={styles.main} ref={contentRef}>
        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <span>Loading section…</span>
          </div>
        ) : section ? (
          <>
            <div className={styles.breadcrumb}>
              <span className={styles.breadcrumbChapter}>{section.chapterTitle}</span>
              <span className={styles.breadcrumbSep}>/</span>
              <span>{section.title}</span>
            </div>
            <div className={styles.contentRow}>
              <article
                className={styles.article}
                dangerouslySetInnerHTML={{ __html: html }}
              />
              <ContentToc headings={headings} contentRef={contentRef} />
            </div>
            <SectionNav manifest={manifest} activeSectionId={section.id} onSelect={handleSelect} />
          </>
        ) : (
          <p>Select a section from the sidebar.</p>
        )}
      </main>
    </div>
  );
}
