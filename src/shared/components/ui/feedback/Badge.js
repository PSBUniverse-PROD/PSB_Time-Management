"use client";

import { Badge as BootstrapBadge } from "react-bootstrap";

export default function Badge({ className = "", bg = "light", text = "dark", ...props }) {
  const mergedClassName = ["psb-ui-badge", className].filter(Boolean).join(" ");

  return <BootstrapBadge bg={bg} text={text} className={mergedClassName} {...props} />;
}
