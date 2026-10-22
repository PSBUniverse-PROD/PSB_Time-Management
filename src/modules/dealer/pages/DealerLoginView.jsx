"use client";

import { useState } from "react";
import Image from "next/image";
import { Button, Form } from "react-bootstrap";
import dealerIcon from "@/styles/psb_dealer_icon.svg";

export default function DealerLoginView() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/dealer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        setError(result?.error || "Unable to sign in right now. Please try again.");
        return;
      }
      // Full navigation so the new cookie is sent with the account page request.
      window.location.assign("/dealer/account");
    } catch {
      setError("Unable to sign in right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="portal-login-shell">
      <div className="portal-login-split">
        <aside className="portal-login-brand" aria-hidden="true">
          <div className="portal-login-brand-inner">
            <Image src={dealerIcon} alt="" className="portal-login-logo portal-login-logo--mark" priority />
            <h1 className="psb-title mb-3">PSBUniverse</h1>
            <p className="psb-label mb-2">Dealer Portal</p>
            <p className="portal-brand-copy mb-0">Sign in to view and manage your dealer account.</p>
          </div>
        </aside>

        <main className="portal-login-main">
          <section className="portal-login-form-shell">
            <header className="portal-login-header">
              <h2 className="portal-login-title mb-2">Dealer sign in</h2>
              <p className="portal-login-subtitle mb-0">Use the username and password provided by PSB</p>
            </header>

            <Form noValidate onSubmit={handleSubmit} className="portal-login-form">
              <Form.Group controlId="dealer-login-username">
                <Form.Label className="portal-login-label">Username</Form.Label>
                <Form.Control
                  type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
                  placeholder="Enter your username" autoComplete="username" autoFocus required
                  className="portal-login-input"
                />
              </Form.Group>

              <Form.Group controlId="dealer-login-password">
                <Form.Label className="portal-login-label">Password</Form.Label>
                <Form.Control
                  type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter your password" autoComplete="current-password" required
                  className="portal-login-input"
                />
              </Form.Group>

              {error ? <div className="portal-inline-error" role="alert" aria-live="assertive">{error}</div> : null}

              <Button type="submit" variant="primary" className="portal-signin-btn w-100" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign In"}
              </Button>
            </Form>

            <p className="portal-support-note mb-0">Forgot your password? Contact PSB to have it reset.</p>
          </section>
        </main>
      </div>
    </div>
  );
}
