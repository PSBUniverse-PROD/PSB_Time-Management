"use client";

import { useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button, Form } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import psbLogo from "@/styles/psb_logo.png";
import { getSupabase } from "@/core/supabase/client";
import { toastError, toastSuccess } from "@/shared/utils/toast";
import { validateRedirectUrl } from "@/core/auth/redirect-validator";
import {
  setAccessTokenCookie, waitForServerSession, validateFields, mapLoginError,
} from "../data/login.data";
import { resolveUsernameToEmail } from "../data/login.actions";

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";
const ENV = process.env.NEXT_PUBLIC_ENV || "local";
const DEFAULT_REDIRECT = ENV === "prod" ? `${CORE_PORTAL_URL}/dashboard` : "/dashboard";

// ── hook ───────────────────────────────────────────────────
function useLogin(redirectParam) {
  const [email, setEmail] = useState("");
  const redirectTo = validateRedirectUrl(redirectParam, DEFAULT_REDIRECT);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({ email: false, password: false });
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });
  const [inlineError, setInlineError] = useState("");
  const [shakeForm, setShakeForm] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const validationErrors = validateFields(email, password);
    const hasValidationError = Boolean(validationErrors.email || validationErrors.password);
    setTouched({ email: true, password: true });
    setFieldErrors(validationErrors);

    if (hasValidationError) {
      setShakeForm(true);
      window.setTimeout(() => setShakeForm(false), 320);
      return;
    }

    setInlineError("");
    setSubmitting(true);

    // Resolve username to email if input doesn't contain @
    const input = String(email || "").trim();
    let loginEmail = input;
    if (!input.includes("@")) {
      const resolvedEmail = await resolveUsernameToEmail(input);
      if (!resolvedEmail) {
        setInlineError("Username not found.");
        toastError("Username not found.", "Sign In Failed", { durationMs: 4500 });
        setShakeForm(true);
        window.setTimeout(() => setShakeForm(false), 320);
        setSubmitting(false);
        return;
      }
      loginEmail = resolvedEmail;
    }

    const supabase = getSupabase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) throw error;
      setAccessTokenCookie(data?.session);

      // Create SSO session — calls POST /api/auth/login to generate JWT + set psb_session cookie
      if (data?.session?.access_token) {
        const ssoResponse = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: data.session.access_token }),
        });

        if (!ssoResponse.ok) {
          const ssoError = await ssoResponse.json().catch(() => ({}));
          console.error("SSO session creation failed:", ssoError);
          // Continue anyway — the sb-access-token cookie may still work for the current flow
        }
      }

      await waitForServerSession();
      toastSuccess("Welcome to PSBUniverse. You have signed in successfully.", "Sign In Success");
      window.location.assign(redirectTo);
    } catch (error) {
      const message = mapLoginError(error?.message);
      setInlineError(message);
      toastError(message, "Sign In Failed", { durationMs: 4500 });
      setShakeForm(true);
      window.setTimeout(() => setShakeForm(false), 320);
    } finally {
      setSubmitting(false);
    }
  }

  function handleEmailChange(event) {
    const nextValue = event.target.value;
    setEmail(nextValue);
    setInlineError("");
    if (touched.email || fieldErrors.email) {
      const errors = validateFields(nextValue, password);
      setFieldErrors((prev) => ({ ...prev, email: errors.email }));
    }
  }

  function handlePasswordChange(event) {
    const nextValue = event.target.value;
    setPassword(nextValue);
    setInlineError("");
    if (touched.password || fieldErrors.password) {
      const errors = validateFields(email, nextValue);
      setFieldErrors((prev) => ({ ...prev, password: errors.password }));
    }
  }

  function handleFieldBlur(fieldName) {
    setTouched((prev) => ({ ...prev, [fieldName]: true }));
    const errors = validateFields(email, password);
    setFieldErrors((prev) => ({ ...prev, [fieldName]: errors[fieldName] }));
  }

  function handlePasswordToggle() {
    setShowPassword((prev) => !prev);
  }

  return {
    email, password, showPassword, submitting, touched, fieldErrors, inlineError, shakeForm,
    handleSubmit, handleEmailChange, handlePasswordChange, handleFieldBlur, handlePasswordToggle,
  };
}

// ── view ───────────────────────────────────────────────────
export default function LoginView() {
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect") || "";
  const h = useLogin(redirectParam);

  return (
    <div className="portal-login-shell">
      <div className="portal-login-split">
        <aside className="portal-login-brand" aria-hidden="true">
          <div className="portal-login-brand-inner">
            <Image src={psbLogo} alt="PSBUniverse logo" className="portal-login-logo" priority />
            <h1 className="psb-title mb-3">PSBUniverse</h1>
            <p className="psb-label mb-2">Operations Workspace</p>
            <p className="portal-brand-copy mb-0">Manage apps, users, and operations in one place.</p>
          </div>
        </aside>

        <main className="portal-login-main">
          <section className={`portal-login-form-shell ${h.shakeForm ? "portal-login-form-shake" : ""}`}>
            <header className="portal-login-header">
              <h2 className="portal-login-title mb-2">Sign in to PSBUniverse</h2>
              <p className="portal-login-subtitle mb-0">Enter your credentials to continue</p>
            </header>

            <Form noValidate onSubmit={h.handleSubmit} className="portal-login-form">
              <Form.Group controlId="login-email">
                <Form.Label className="portal-login-label">Email or Username</Form.Label>
                <Form.Control
                  type="text" value={h.email} onChange={h.handleEmailChange}
                  onBlur={() => h.handleFieldBlur("email")} placeholder="Enter your email or username"
                  autoComplete="username" autoFocus required className="portal-login-input"
                  isInvalid={Boolean(h.touched.email && h.fieldErrors.email)}
                  aria-describedby={h.touched.email && h.fieldErrors.email ? "login-email-error" : undefined}
                />
                {h.touched.email && h.fieldErrors.email ? (
                  <div id="login-email-error" className="portal-field-error" role="alert">{h.fieldErrors.email}</div>
                ) : null}
              </Form.Group>

              <Form.Group controlId="login-password">
                <Form.Label className="portal-login-label">Password</Form.Label>
                <div className="portal-password-field">
                  <Form.Control
                    type={h.showPassword ? "text" : "password"} value={h.password}
                    onChange={h.handlePasswordChange} onBlur={() => h.handleFieldBlur("password")}
                    placeholder="Enter your password" autoComplete="current-password" required
                    className="portal-login-input portal-password-input"
                    isInvalid={Boolean(h.touched.password && h.fieldErrors.password)}
                    aria-describedby={h.touched.password && h.fieldErrors.password ? "login-password-error" : undefined}
                  />
                  <button type="button" className="portal-password-toggle" onClick={h.handlePasswordToggle}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={h.showPassword ? "Hide password" : "Show password"} aria-pressed={h.showPassword}>
                    <FontAwesomeIcon icon={h.showPassword ? faEyeSlash : faEye} aria-hidden="true" />
                    <span>{h.showPassword ? "Hide" : "Show"}</span>
                  </button>
                </div>
                {h.touched.password && h.fieldErrors.password ? (
                  <div id="login-password-error" className="portal-field-error" role="alert">{h.fieldErrors.password}</div>
                ) : null}
              </Form.Group>

              {h.inlineError ? (
                <div className="portal-inline-error" role="alert" aria-live="assertive">{h.inlineError}</div>
              ) : null}

              <Button type="submit" variant="primary" className="portal-signin-btn w-100" disabled={h.submitting}>
                {h.submitting ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />Signing in...</>
                ) : "Sign In"}
              </Button>
            </Form>

            <p className="portal-support-note mb-0">Need access? Contact admin</p>
          </section>
        </main>
      </div>
    </div>
  );
}
