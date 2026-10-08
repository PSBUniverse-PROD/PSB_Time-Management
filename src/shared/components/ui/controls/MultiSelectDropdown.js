"use client";

import { forwardRef, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Form from "react-bootstrap/Form";
import { Dropdown as BootstrapDropdown } from "react-bootstrap";

const MultiSelectToggle = forwardRef(({ children, onClick, className = "", disabled, ...props }, ref) => (
  <button
    type="button"
    ref={ref}
    className={className}
    disabled={disabled}
    onClick={(event) => {
      event.preventDefault();
      onClick?.(event);
    }}
    {...props}
  >
    {children}
  </button>
));
MultiSelectToggle.displayName = "MultiSelectToggle";

// Renders the dropdown menu into document.body instead of in place, so it
// can't be visually clipped by an ancestor with overflow:auto/hidden (e.g.
// FilterPanel's scrollable popover). react-bootstrap still supplies
// positioning props (style, placement) to this component as normal; only
// the DOM location changes, not the Popper positioning logic.
const PortalMenu = forwardRef(({ children, style, className, "aria-labelledby": labeledBy }, ref) => {
  return createPortal(
    <div
      ref={ref}
      style={style}
      className={className}
      aria-labelledby={labeledBy}
      data-multiselect-portal="true"
    >
      {children}
    </div>,
    document.body
  );
});
PortalMenu.displayName = "PortalMenu";

// Lists longer than this get the search box without asking for it.
const SEARCH_AUTO_THRESHOLD = 8;

function MultiSelectDropdown({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "Select...",
  menuStyle,
  className = "",
  disabled = false,
  searchable,
  searchPlaceholder = "Search...",
  emptyMessage = "No matches.",
  ...props
}) {
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef(null);
  const instanceId = useId();

  // `searchable` forces the search box on or off. When it is not set, the box
  // appears on its own for lists long enough to need it.
  const showSearch = searchable ?? options.length > SEARCH_AUTO_THRESHOLD;
  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!showSearch || !term) return options;
    return options.filter((option) => String(option.label ?? "").toLowerCase().includes(term));
  }, [options, query, showSearch]);

  useEffect(() => {
    if (!show || !showSearch) return undefined;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [show, showSearch]);

  const selectedSet = useMemo(() => new Set(selectedValues || []), [selectedValues]);
  const selectedLabels = useMemo(() => {
    const labels = options
      .filter((option) => selectedSet.has(option.value))
      .map((option) => option.label);
    return labels.length > 0 ? labels.join(", ") : "";
  }, [options, selectedSet]);

  const selectedCount = selectedValues?.length || 0;
  const selectedLabel = selectedCount > 0 ? `${selectedCount} selected` : placeholder;

  const handleToggleValue = (value) => {
    const nextValues = selectedSet.has(value)
      ? selectedValues.filter((item) => item !== value)
      : [...selectedValues, value];
    onChange?.(nextValues);
  };

  return (
    <BootstrapDropdown
      show={show}
      onToggle={(nextShow) => {
        setShow(nextShow);
        if (!nextShow) setQuery("");
      }}
      className={className}
      {...props}
    >
      <BootstrapDropdown.Toggle
        as={MultiSelectToggle}
        disabled={disabled}
        className={["psb-ui-multiselect-toggle", "form-select", className].filter(Boolean).join(" ")}
        style={{ textAlign: "left" }}
      >
        {selectedLabel}
      </BootstrapDropdown.Toggle>
      <BootstrapDropdown.Menu
        as={PortalMenu}
        renderOnMount
        popperConfig={{ strategy: "fixed" }}
        style={{
          minWidth: 240,
          padding: 8,
          maxHeight: 320,
          overflowY: "auto",
          // Above the shared Modal (z-index 9999) so the menu works inside one.
          zIndex: 10000,
          ...menuStyle,
        }}
      >
        {showSearch ? (
          <div style={{ position: "sticky", top: -8, margin: "-8px -8px 6px", padding: 8, background: "#ffffff", zIndex: 1 }}>
            {/* type="text": the dropdown ignores Escape from type="search" inputs. */}
            <Form.Control
              ref={searchRef}
              type="text"
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
        ) : null}
        {showSearch && visibleOptions.length === 0 ? (
          <div className="small text-muted" style={{ padding: "4px 0" }}>{emptyMessage}</div>
        ) : null}
        {visibleOptions.map((option) => (
          <div key={option.value} style={{ padding: "4px 0" }}>
            <Form.Check
              type="checkbox"
              id={`psb-multiselect-${instanceId}-${String(option.value)}`}
              checked={selectedSet.has(option.value)}
              onChange={() => handleToggleValue(option.value)}
              label={option.label}
              style={{ margin: 0 }}
            />
          </div>
        ))}
      </BootstrapDropdown.Menu>
    </BootstrapDropdown>
  );
}

export { MultiSelectToggle, PortalMenu };
export default MultiSelectDropdown;
