"use client";

import { Container, Spinner } from "react-bootstrap";
import { useAuth } from "@/core/auth/useAuth";
import { hasAppAccess } from "@/core/auth/access";

export default function ModuleAccessGate({ appId, children }) {
  const { roles, loading } = useAuth();

  if (loading) {
    return (
      <main className="auth-loading">
        <Spinner animation="border" role="status" />
      </main>
    );
  }

  if (!hasAppAccess(roles, appId)) {
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
