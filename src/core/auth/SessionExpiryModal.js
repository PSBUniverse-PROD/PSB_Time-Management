"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import Modal from "@/shared/components/ui/overlay/Modal";
import Button from "@/shared/components/ui/controls/Button";

export default function SessionExpiryModal({ expiresAt, busy, error, onExtend, onDismiss }) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const updateCountdown = () => {
      setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remaining = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <Modal
      show
      title="Session Expiring"
      onHide={() => { if (!busy) onDismiss(); }}
      backdrop="static"
      keyboard={!busy}
      aria-label="Session expiring"
      footer={
        <>
          <Button variant="ghost" onClick={onDismiss} disabled={busy}>Not now</Button>
          <Button onClick={onExtend} loading={busy} disabled={secondsLeft === 0}>
            <FontAwesomeIcon icon={faRotateRight} className="me-2" />
            Extend for 24 hours
          </Button>
        </>
      }
    >
      <p className="mb-0">
        Your session expires in <strong className="font-monospace" role="timer">{remaining}</strong>.
      </p>
      {error ? <p className="text-danger mt-3 mb-0" role="alert">{error}</p> : null}
    </Modal>
  );
}