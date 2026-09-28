"use client";

import { useMemo } from "react";
import Form from "react-bootstrap/Form";
import Button from "@/shared/components/ui/controls/Button";

function normalizeExportFormats(exportFormats) {
  if (!Array.isArray(exportFormats)) {
    return ["csv", "excel"];
  }

  const normalized = exportFormats
    .map((format) => String(format || "").trim().toLowerCase())
    .filter((format) => format === "csv" || format === "excel");

  return normalized.length > 0 ? normalized : ["csv", "excel"];
}

function isSorted(sorting) {
  return String(sorting?.key || "").trim() !== "";
}

export default function TableSidePanel({
  open = false,
  columns = [],
  columnVisibility = {},
  sorting = {},
  exportFormats = ["csv", "excel"],
  onToggleColumn,
  onClearSorting,
  onExport,
  onClose,
}) {
  const normalizedFormats = useMemo(() => normalizeExportFormats(exportFormats), [exportFormats]);

  const visibleColumnCount = useMemo(
    () =>
      columns.filter((column) => {
        const key = String(column?.key || "").trim();
        return key !== "" && column?.isSystem !== true && columnVisibility[key] !== false;
      }).length,
    [columnVisibility, columns],
  );

  return (
    <aside className={["psb-ui-table-sidepanel", open ? "is-open" : ""].filter(Boolean).join(" ")} aria-hidden={!open}>
      <div className="psb-ui-table-sidepanel-header">
        <h3 className="psb-ui-table-sidepanel-title mb-0">Customize Table</h3>
        <button type="button" className="psb-ui-table-sidepanel-close" onClick={onClose} aria-label="Close panel">
          x
        </button>
      </div>

      <section className="psb-ui-table-sidepanel-section">
        <h4 className="psb-ui-table-sidepanel-section-title">Columns</h4>

        <div className="psb-ui-table-sidepanel-columns">
          {columns.map((column) => {
            const key = String(column?.key || "").trim();

            if (!key) {
              return null;
            }

            const checked = columnVisibility[key] !== false;
            const disableToggle = column?.isSystem !== true && checked && visibleColumnCount <= 1;

            return (
              <Form.Check
                key={key}
                id={`table-sidepanel-column-${key}`}
                type="checkbox"
                label={String(column?.label || key)}
                checked={checked}
                disabled={disableToggle}
                onChange={(event) => onToggleColumn?.(key, event.target.checked)}
              />
            );
          })}
        </div>
      </section>

      <section className="psb-ui-table-sidepanel-section">
        <h4 className="psb-ui-table-sidepanel-section-title">Sorting</h4>

        {isSorted(sorting) ? (
          <Button size="sm" variant="secondary" onClick={onClearSorting}>
            Clear Sorting
          </Button>
        ) : (
          <p className="psb-ui-table-sidepanel-muted mb-0">No active sorting.</p>
        )}
      </section>

      <section className="psb-ui-table-sidepanel-section">
        <h4 className="psb-ui-table-sidepanel-section-title">Export</h4>

        <div className="psb-ui-table-sidepanel-export-actions">
          {normalizedFormats.map((format) => (
            <Button
              key={format}
              size="sm"
              variant="secondary"
              onClick={() => onExport?.(format)}
            >
              Export {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </section>
    </aside>
  );
}
