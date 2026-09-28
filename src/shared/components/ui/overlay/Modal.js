"use client";

import { Modal as BootstrapModal } from "react-bootstrap";

export default function Modal({
  title,
  children,
  footer,
  bodyClassName = "",
  show,
  onHide,
  ...props
}) {
  const mergedBodyClassName = ["psb-ui-modal-body", bodyClassName].filter(Boolean).join(" ");

  return (
    <BootstrapModal show={show} onHide={onHide} centered style={{ zIndex: 9999 }} {...props}>
      {title ? (
        <BootstrapModal.Header closeButton>
          <BootstrapModal.Title>{title}</BootstrapModal.Title>
        </BootstrapModal.Header>
      ) : null}
      <BootstrapModal.Body className={mergedBodyClassName}>{children}</BootstrapModal.Body>
      {footer ? <BootstrapModal.Footer>{footer}</BootstrapModal.Footer> : null}
    </BootstrapModal>
  );
}
