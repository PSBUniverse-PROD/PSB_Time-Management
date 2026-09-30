"use client";

import { useEffect, useState } from "react";
import { Button, Card, Form } from "react-bootstrap";
import { getSupabase } from "@/core/supabase/client";
import { toastError, toastSuccess } from "@/shared/utils/toast";

/**
 * "Log in as user" card — visible only to users holding the CORE MANAGER role.
 * Visibility is driven by GET /api/auth/impersonate; the real gate is
 * enforced server-side on POST.
 */
export default function ImpersonatePanel() {
  const [allowed, setAllowed] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/impersonate", { method: "GET" })
      .then((res) => (res.ok ? res.json() : { canImpersonate: false }))
      .then((data) => { if (active) setAllowed(Boolean(data?.canImpersonate)); })
      .catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, []);

  if (!allowed) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const target = String(identifier || "").trim();
    if (!target) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: target }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toastError(err?.error || "Impersonation failed.", "Log in as user");
        setSubmitting(false);
        return;
      }

      // Drop the admin's local Supabase session so the impersonated identity
      // is the one the client resolves after reload. The server has already
      // switched psb_session and cleared sb-access-token.
      try {
        await getSupabase().auth.signOut({ scope: "local" });
      } catch {
        // ignore — cookies already switched server-side
      }

      toastSuccess(`Now signed in as ${target}.`, "Log in as user");
      window.location.assign("/dashboard");
    } catch {
      toastError("Impersonation failed.", "Log in as user");
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-0 shadow-sm mb-3">
      <Card.Body>
        <p className="profile-section-kicker mb-1">Admin</p>
        <h4 className="mb-1">Log in as user</h4>
        <p className="text-muted mb-2">
          Enter a username or email to switch into that user&apos;s session.
          To return to your own account, sign out and sign back in.
        </p>
        <Form onSubmit={handleSubmit} className="d-flex gap-2 align-items-start">
          <Form.Control
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="username or email"
            autoComplete="off"
            disabled={submitting}
          />
          <Button type="submit" variant="primary" disabled={submitting || !identifier.trim()}>
            {submitting ? "Switching..." : "Log in"}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}
