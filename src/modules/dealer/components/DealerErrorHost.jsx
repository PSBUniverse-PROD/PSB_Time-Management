"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "@/shared/components/ui";
import { DEALER_ERROR_EVENT } from "../data/dealerErrorReport";

/**
 * The dealer module's error window. Opened by showDealerError() for
 * unexpected errors; shows what happened plus details the user can copy,
 * screenshot or email to support. Place it once per page.
 */
export default function DealerErrorHost({ supportEmail = "" }) {
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function handleReport(event) {
      setReport(event.detail || null);
      setCopied(false);
    }
    window.addEventListener(DEALER_ERROR_EVENT, handleReport);
    return () => window.removeEventListener(DEALER_ERROR_EVENT, handleReport);
  }, []);

  if (!report) return null;

  const close = () => setReport(null);

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(report.details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const mailto = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(`PSBUniverse problem: ${report.title}`)}&body=${encodeURIComponent(report.details)}`
    : "";

  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={close}>Close</Button>
      <Button type="button" variant="secondary" onClick={copyDetails}>{copied ? "Copied" : "Copy details"}</Button>
      {mailto ? <Button variant="primary" href={mailto}>Email support</Button> : null}
    </>
  );

  return (
    <Modal show onHide={close} title={report.title || "Something went wrong"} footer={footer}>
      <div className="d-flex flex-column gap-3">
        <p className="mb-0">{report.message}</p>
        <p className="mb-0 small text-muted">
          Something went wrong on our side. Please send the details below to {supportEmail || "PSB support"}: copy and paste them into an email, or take a screenshot of this window.
        </p>
        <Input as="textarea" rows={5} value={report.details} readOnly className="font-monospace small" />
      </div>
    </Modal>
  );
}
