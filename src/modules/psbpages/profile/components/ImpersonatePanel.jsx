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
export default function ImpersonatePanel({ roleGroups = [] }) {
  const [allowed, setAllowed] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [denialReason, setDenialReason] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/impersonate", { method: "GET" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || "Unable to verify impersonation permission.");
        return data;
      })
      .then((data) => {
        if (!active) return;
        setAllowed(Boolean(data?.canImpersonate));
        setDenialReason(data?.denialReason || "");
      })
      .catch((error) => {
        if (!active) return;
        setAllowed(false);
        setPermissionError(error?.message || "Unable to verify impersonation permission.");
      });
    return () => { active = false; };
  }, []);

  if (!allowed) {
    const profileListsManagerRole = roleGroups.some((group) =>
      group.roles?.some((role) => role.roleName.trim().toLowerCase() === "core manager"),
    );

    if (permissionError) {
      return <div className="notice-banner notice-banner-warning mb-3" role="alert">{permissionError}</div>;
    }
    if (profileListsManagerRole) {
      const mismatchMessage = {
        session_user_missing: "Core could not identify the verified user session. Sign out and sign in again.",
        no_active_assignments: "Core found no active role assignments for this session. The profile and session may belong to different user records; sign out and sign in again.",
        required_role_not_assigned: "Core found no active CORE MANAGER assignment for this session user. Verify the user record linked to this sign-in.",
        required_role_inactive: "The CORE MANAGER role definition is inactive. Activate the role in Role Setup.",
      }[denialReason];
      return (
        <div className="notice-banner notice-banner-warning mb-3" role="status">
          {mismatchMessage || "Your profile lists CORE MANAGER, but the server could not verify an active assignment."}
        </div>
      );
    }
    return null;
  }

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
          Your session is preserved; use the return control at the top of the page to switch back.
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

export function ImpersonationBanner() {
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/impersonate", { method: "GET" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (active) setIsImpersonating(Boolean(data?.isImpersonating)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  async function restoreSession() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Unable to return to your account.");
      }

      try {
        await getSupabase().auth.signOut({ scope: "local" });
      } catch {
        // The original server session has already been restored.
      }
      window.location.assign("/dashboard");
    } catch (restoreError) {
      setError(restoreError?.message || "Unable to return to your account.");
      setBusy(false);
    }
  }

  if (!isImpersonating) return null;

  return (
    <div className="notice-banner notice-banner-warning mx-3 mt-2 d-flex flex-wrap justify-content-between align-items-center gap-2" role="status">
      <span>{error || "You are viewing PSBUniverse as another user."}</span>
      <Button type="button" size="sm" variant="outline-primary" onClick={restoreSession} disabled={busy}>
        {busy ? "Returning..." : "Return to my account"}
      </Button>
    </div>
  );
}
