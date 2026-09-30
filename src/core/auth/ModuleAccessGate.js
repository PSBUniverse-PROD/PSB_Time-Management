"use client";

import { useEffect, useState } from "react";
import { Container, Spinner } from "react-bootstrap";
import { hasModuleAccess } from "@/core/sso-client";

/**
 * Guards a module page. Access is decided by CORE: hasModuleAccess() calls
 * /api/auth/introspect with this deployment's NEXT_PUBLIC_MODULE_KEY and returns
 * core's verified authorizedForApp. The legacy `appId` prop is ignored (kept so
 * existing <ModuleAccessGate appId=…> call sites still compile).
 */
export default function ModuleAccessGate({ children }) {
  const [status, setStatus] = useState("checking"); // "checking" | "allowed" | "denied"

  useEffect(() => {
    let active = true;
    hasModuleAccess()
      .then((ok) => { if (active) setStatus(ok ? "allowed" : "denied"); })
      .catch(() => { if (active) setStatus("denied"); });
    return () => { active = false; };
  }, []);

  if (status === "checking") {
    return (
      <main className="auth-loading">
        <Spinner animation="border" role="status" />
      </main>
    );
  }

  if (status === "denied") {
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
