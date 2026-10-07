"use client";

import { useEffect, useState } from "react";
import { Container, Spinner } from "react-bootstrap";
import { SSO_ENABLED, hasModuleAccess } from "@/core/sso-client";
import { useAuth } from "@/core/auth/useAuth";
import { hasAppAccess } from "@/core/auth/access";

/**
 * Guards a module page. Access is decided by CORE: hasModuleAccess() calls
 * /api/auth/introspect with this deployment's NEXT_PUBLIC_MODULE_KEY and returns
 * core's verified authorizedForApp in prod. Local and dev use appId and
 * the authenticated user's bootstrap roles instead of introspection.
 */
export default function ModuleAccessGate({ children, appId }) {
  const [status, setStatus] = useState("checking"); // "checking" | "allowed" | "denied"
  const { loading, authUser, roles } = useAuth();

  useEffect(() => {
    if (!SSO_ENABLED) return;
    let active = true;
    hasModuleAccess()
      .then((ok) => { if (active) setStatus(ok ? "allowed" : "denied"); })
      .catch(() => { if (active) setStatus("denied"); });
    return () => { active = false; };
  }, []);

  const accessStatus = SSO_ENABLED ? status : loading ? "checking" : authUser && hasAppAccess(roles, appId) ? "allowed" : "denied";

  if (accessStatus === "checking") {
    return (
      <main className="auth-loading">
        <Spinner animation="border" role="status" />
      </main>
    );
  }

  if (accessStatus === "denied") {
    return (
      <Container className="py-4" style={{ maxWidth: 1200 }}>
        <div className="notice-banner notice-banner-warning mb-0">
          <strong className="d-block">No access to this module.</strong>
          <span>You do not have permission to view this page.</span>
        </div>
      </Container>
    );
  }

  return children;
}
