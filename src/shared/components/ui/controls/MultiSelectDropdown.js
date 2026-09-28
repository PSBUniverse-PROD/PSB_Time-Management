"use client";

import { forwardRef, useId, useMemo, useState } from "react";
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

function MultiSelectDropdown({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "Select...",
  menuStyle,
  className = "",
  disabled = false,
  ...props
}) {
  const [show, setShow] = useState(false);
  const instanceId = useId();

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
      onToggle={(nextShow) => setShow(nextShow)}
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
          zIndex: 2000,
          ...menuStyle,
        }}
      >
        {options.map((option) => (
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

export default MultiSelectDropdown;
