"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Form from "react-bootstrap/Form";
import { Dropdown as BootstrapDropdown } from "react-bootstrap";
import { MultiSelectToggle, PortalMenu } from "@/shared/components/ui/controls/MultiSelectDropdown";

function hasSelection(value) {
  return value !== null && value !== undefined && value !== "";
}

export default function SearchSelect({
  options = [],
  value = null,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No matches.",
  clearable = true,
  menuStyle,
  className = "",
  disabled = false,
  ...props
}) {
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef(null);
  const id = useId();

  const selectedOption = useMemo(
    () => (hasSelection(value) ? options.find((option) => String(option.value) === String(value)) || null : null),
    [options, value],
  );

  const visibleOptions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => String(option.label ?? "").toLowerCase().includes(term));
  }, [options, query]);

  useEffect(() => {
    if (!show) return undefined;
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [show]);

  const closeMenu = () => {
    setShow(false);
    setQuery("");
    setActiveIndex(0);
  };

  const selectOption = (option) => {
    onChange?.(option.value, option);
    closeMenu();
  };

  const clearSelection = () => {
    onChange?.(null, null);
    closeMenu();
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(visibleOptions.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visibleOptions[activeIndex];
      if (option) selectOption(option);
    }
  };

  return (
    <BootstrapDropdown
      show={show}
      onToggle={(nextShow) => {
        if (nextShow) setShow(true);
        else closeMenu();
      }}
      className={className}
      {...props}
    >
      <BootstrapDropdown.Toggle
        as={MultiSelectToggle}
        id={id}
        disabled={disabled}
        className="psb-ui-searchselect-toggle form-select"
        style={{ textAlign: "left" }}
      >
        {selectedOption ? selectedOption.label : <span className="text-muted">{placeholder}</span>}
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
        <div style={{ position: "sticky", top: -8, margin: "-8px -8px 6px", padding: 8, background: "#ffffff", zIndex: 1 }}>
          {/* type="text": the dropdown ignores Escape from type="search" inputs. */}
          <Form.Control
            ref={searchRef}
            type="text"
            size="sm"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
        </div>
        {clearable && selectedOption ? (
          <button type="button" className="dropdown-item small text-muted" onClick={clearSelection}>
            Clear selection
          </button>
        ) : null}
        {visibleOptions.length === 0 ? (
          <div className="small text-muted" style={{ padding: "4px 0" }}>{emptyMessage}</div>
        ) : null}
        {visibleOptions.map((option, index) => {
          const isSelected = selectedOption !== null && String(option.value) === String(selectedOption.value);
          const isActive = index === activeIndex;
          return (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`dropdown-item${isSelected ? " active" : ""}`}
              style={!isSelected && isActive ? { backgroundColor: "#e8f3ff" } : undefined}
              ref={isActive ? (node) => {
                node?.scrollIntoView?.({ block: "nearest" });
              } : undefined}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          );
        })}
      </BootstrapDropdown.Menu>
    </BootstrapDropdown>
  );
}
