"use client";

import { Dropdown as BootstrapDropdown } from "react-bootstrap";

function Dropdown(props) {
  return <BootstrapDropdown {...props} />;
}

function DropdownMenu(props) {
  return (
    <BootstrapDropdown.Menu
      renderOnMount
      {...props}
      style={{ zIndex: 9999, ...props.style }}
    />
  );
}

Dropdown.Toggle = BootstrapDropdown.Toggle;
Dropdown.Menu = DropdownMenu;
Dropdown.Item = BootstrapDropdown.Item;
Dropdown.Divider = BootstrapDropdown.Divider;

export default Dropdown;