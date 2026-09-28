"use client";

import { Card as BootstrapCard } from "react-bootstrap";

export default function Card({
  title,
  subtitle,
  children,
  className = "",
  bodyClassName = "",
  header,
  footer,
  ...props
}) {
  const mergedClassName = ["psb-ui-card", className].filter(Boolean).join(" ");
  const mergedBodyClassName = ["psb-ui-card-body", bodyClassName].filter(Boolean).join(" ");

  return (
    <BootstrapCard className={mergedClassName} {...props}>
      {header || title || subtitle ? (
        <BootstrapCard.Header className="psb-ui-card-header">
          {header || (
            <>
              {title ? <h3 className="psb-ui-card-title mb-0">{title}</h3> : null}
              {subtitle ? <p className="psb-ui-card-subtitle mb-0">{subtitle}</p> : null}
            </>
          )}
        </BootstrapCard.Header>
      ) : null}
      <BootstrapCard.Body className={mergedBodyClassName}>{children}</BootstrapCard.Body>
      {footer ? <BootstrapCard.Footer className="psb-ui-card-footer">{footer}</BootstrapCard.Footer> : null}
    </BootstrapCard>
  );
}
