"use client";

import { useCallback, useMemo, useState } from "react";
import { Button, Card, Col, Container, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useAuth } from "@/core/auth/useAuth";
import { getSupabase } from "@/core/supabase/client";
import { toastError, toastInfo, toastSuccess } from "@/shared/utils/toast";
import { Badge, StatusBadge } from "@/shared/components/ui";
import {
  hasText, getLabel, buildInitials, statusIsActive, buildRequestUpdateMailto,
  buildProfile, buildRelations, buildRoleGroupsByApp,
  MIN_PASSWORD_LENGTH, PASSWORD_NUMBER_OR_SYMBOL_REGEX,
} from "../data/profile.data";

// ── hook ───────────────────────────────────────────────────
function useProfile() {
  const { dbUser, authUser, roles, loading } = useAuth();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const profile = useMemo(() => buildProfile(dbUser, authUser), [authUser, dbUser]);
  const relations = useMemo(() => buildRelations(dbUser), [dbUser]);

  const companyLabel = useMemo(() => {
    if (relations?.company) return getLabel(relations.company, ["comp_name", "company_name"]);
    return "No company assigned";
  }, [relations]);

  const departmentLabel = useMemo(() => {
    if (relations?.department) return getLabel(relations.department, ["dept_name", "department_name"]);
    return "No department assigned";
  }, [relations]);

  const statusLabel = useMemo(() => {
    if (relations?.status) return getLabel(relations.status, ["sts_name", "status_name"]);
    return "No status assigned";
  }, [relations]);

  const fullName = useMemo(() => {
    const first = String(profile.first_name || "").trim();
    const last = String(profile.last_name || "").trim();
    if (first || last) return `${first} ${last}`.trim();
    return profile.username || profile.email || "User";
  }, [profile.email, profile.first_name, profile.last_name, profile.username]);

  const initials = useMemo(() => buildInitials(profile.first_name, profile.last_name, profile.username), [profile.first_name, profile.last_name, profile.username]);

  const adminEmail = useMemo(() => String(relations?.company?.comp_email || "").trim(), [relations]);
  const isActive = useMemo(() => statusIsActive(statusLabel, relations?.status), [relations?.status, statusLabel]);
  const roleGroupsByApp = useMemo(() => buildRoleGroupsByApp(roles), [roles]);
  const requestUpdateHref = useMemo(() => buildRequestUpdateMailto(adminEmail, profile.username), [adminEmail, profile.username]);
  const hasAccess = roleGroupsByApp.length > 0;

  const copyToClipboard = useCallback(async (value, label) => {
    const text = String(value || "").trim();
    if (!text) { toastInfo(`${label} is not available to copy.`, "User Profile"); return; }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text; textarea.style.position = "fixed"; textarea.style.left = "-9999px";
        document.body.appendChild(textarea); textarea.focus(); textarea.select();
        document.execCommand("copy"); document.body.removeChild(textarea);
      }
      toastSuccess(`${label} copied.`, "User Profile");
    } catch { toastError(`Unable to copy ${label.toLowerCase()}.`, "User Profile"); }
  }, []);

  const resetPasswordModal = useCallback(() => {
    setNewPassword(""); setConfirmPassword(""); setShowNewPassword(false);
    setShowConfirmPassword(false); setPasswordError(""); setPasswordSubmitting(false);
  }, []);

  const openPasswordModal = useCallback(() => { resetPasswordModal(); setShowPasswordModal(true); }, [resetPasswordModal]);

  const closePasswordModal = useCallback(() => {
    if (passwordSubmitting) return;
    setShowPasswordModal(false); resetPasswordModal();
  }, [passwordSubmitting, resetPasswordModal]);

  const submitPasswordUpdate = useCallback(async (event) => {
    event.preventDefault();
    if (passwordSubmitting) return;
    const nextPassword = String(newPassword || "");
    const nextConfirm = String(confirmPassword || "");
    if (!nextPassword.trim() || !nextConfirm.trim()) { setPasswordError("Password is required"); return; }
    if (nextPassword.length < MIN_PASSWORD_LENGTH) { setPasswordError("Password must be at least 8 characters"); return; }
    if (!PASSWORD_NUMBER_OR_SYMBOL_REGEX.test(nextPassword)) { setPasswordError("Password must include at least one number or symbol"); return; }
    if (nextPassword !== nextConfirm) { setPasswordError("Passwords do not match"); return; }
    setPasswordError(""); setPasswordSubmitting(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) { setPasswordError(error.message || "Unable to update password right now"); return; }
      toastSuccess("Password updated successfully", "User Profile");
      setShowPasswordModal(false); resetPasswordModal();
    } catch (error) { setPasswordError(error?.message || "Unable to update password right now"); }
    finally { setPasswordSubmitting(false); }
  }, [confirmPassword, newPassword, passwordSubmitting, resetPasswordModal]);

  return {
    loading, profile, relations, companyLabel, departmentLabel, statusLabel,
    fullName, initials, adminEmail, isActive, roleGroupsByApp, requestUpdateHref, hasAccess,
    copyToClipboard,
    showPasswordModal, newPassword, setNewPassword, confirmPassword, setConfirmPassword,
    showNewPassword, setShowNewPassword, showConfirmPassword, setShowConfirmPassword,
    passwordSubmitting, passwordError, setPasswordError,
    openPasswordModal, closePasswordModal, submitPasswordUpdate,
  };
}

// ── components ─────────────────────────────────────────────

function ProfileSocialCard({
  profile, fullName, initials, isActive, companyLabel, departmentLabel,
  adminEmail, requestUpdateHref, copyToClipboard,
}) {
  return (
    <Card className="profile-social-card border-0 shadow-sm">
      <Card.Body className="profile-social-card-body">
        <div className="profile-card-actions">
          {requestUpdateHref ? (
            <Button as="a" href={requestUpdateHref} size="sm" className="profile-action-primary">
              Request Update
            </Button>
          ) : null}
          <Button type="button" variant="outline-secondary" size="sm"
            onClick={() => void copyToClipboard(profile.email, "Email")}>
            Copy Email
          </Button>
          <Button type="button" variant="outline-secondary" size="sm"
            onClick={() => void copyToClipboard(profile.username, "Username")}>
            Copy Username
          </Button>
        </div>

        <div className="profile-social-content">
          <div className="profile-avatar">{initials}</div>
          <h3 className="profile-name mb-1 text-center">{fullName}</h3>
          <p className="profile-handle mb-2 text-center">@{String(profile.username || "unknown")}</p>
          <StatusBadge status={isActive ? "active" : "inactive"} />

          <div className="profile-org-lines mt-3 text-center">
            <p className="mb-1">{companyLabel}</p>
            <p className="mb-0">{departmentLabel}</p>
          </div>

          {hasText(adminEmail) ? (
            <div className="profile-admin-contact mt-3 text-center">
              <p className="mb-1 text-muted">Administrator Contact</p>
              <a href={`mailto:${adminEmail}`} className="profile-admin-link">{adminEmail}</a>
            </div>
          ) : null}
        </div>
      </Card.Body>
    </Card>
  );
}

function ProfileSummaryCard({
  profile, companyLabel, departmentLabel,
  requestUpdateHref, copyToClipboard,
}) {
  const renderValue = useCallback((value, options = {}) => {
    const text = String(value || "").trim();
    if (text) {
      if (options.type === "email") return <a href={`mailto:${text}`} className="profile-inline-link">{text}</a>;
      return <span>{text}</span>;
    }
    return (
      <span className="profile-empty-value">
        <span className="profile-empty-icon" aria-hidden="true">i</span>
        <span>Not available</span>
        {requestUpdateHref ? <a href={requestUpdateHref} className="profile-empty-action-link">Request update</a> : null}
      </span>
    );
  }, [requestUpdateHref]);

  return (
    <Card className="profile-summary-card border-0 shadow-sm mb-3">
      <Card.Body className="profile-summary-card-body">
        <p className="profile-section-kicker mb-1">My PSB</p>
        <h4 className="mb-1">Profile Snapshot</h4>
        <p className="text-muted mb-2">Your account details are visible here for quick reference.</p>

        <Row className="g-2 profile-info-grid">
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Email</p>
              <p className="profile-detail-value mb-0">{renderValue(profile.email, { type: "email" })}</p>
            </div>
          </Col>
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Phone</p>
              <p className="profile-detail-value mb-0">{renderValue(profile.phone)}</p>
            </div>
          </Col>
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Address</p>
              <p className="profile-detail-value mb-0">{renderValue(profile.address)}</p>
            </div>
          </Col>
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Username</p>
              <p className="profile-detail-value mb-0 d-flex align-items-center justify-content-between gap-2">
                <span>{String(profile.username || "unknown")}</span>
                <button type="button" className="profile-mini-copy"
                  onClick={() => void copyToClipboard(profile.username, "Username")}>
                  Copy
                </button>
              </p>
            </div>
          </Col>
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Company</p>
              <p className="profile-detail-value mb-0">{companyLabel}</p>
            </div>
          </Col>
          <Col sm={6}>
            <div className="profile-detail-tile" tabIndex={0}>
              <p className="profile-detail-label mb-1">Department</p>
              <p className="profile-detail-value mb-0">{departmentLabel}</p>
            </div>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}

function ProfileRolesCard({ roleGroupsByApp }) {
  return (
    <Card className="profile-roles-card border-0 shadow-sm">
      <Card.Body>
        <p className="profile-detail-label mb-2">Roles</p>
        {roleGroupsByApp.length > 0 ? (
          <div className="profile-role-groups">
            {roleGroupsByApp.map((group) => (
              <div key={`role-group-${group.appId || group.appName}`} className="profile-role-group-card">
                <p className="profile-role-app-name mb-1">{group.appName}</p>
                <div className="profile-role-pills">
                  {group.roles.map((role) => (
                    <Badge key={`role-pill-${group.appId}-${role.roleId || role.roleName}`}
                      className="profile-role-pill" bg="light" text="dark">
                      {role.roleName}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="profile-empty-value profile-empty-roles">
            <span className="profile-empty-icon" aria-hidden="true">i</span>
            <span>No roles assigned</span>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function ProfileRequestCard({ requestUpdateHref, openPasswordModal }) {
  return (
    <Card className="profile-request-card border-0 shadow-sm">
      <Card.Body>
        <h5 className="mb-2">Need to update something?</h5>
        <p className="text-muted mb-2">Profile field changes are handled by administrators.</p>
        {requestUpdateHref ? (
          <>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              <a href={requestUpdateHref} className="btn btn-sm btn-primary">Request Update</a>
              <Button type="button" variant="outline-secondary" size="sm" onClick={openPasswordModal}>
                Update Password
              </Button>
            </div>
            <p className="mb-0">
              Send your profile update request by email and include your username plus exact changes needed.
            </p>
          </>
        ) : (
          <>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
              <Button type="button" variant="outline-secondary" size="sm" onClick={openPasswordModal}>
                Update Password
              </Button>
            </div>
            <p className="mb-0">Contact your administrator to request profile field updates.</p>
          </>
        )}
      </Card.Body>
    </Card>
  );
}

function ProfilePasswordModal({
  showPasswordModal, closePasswordModal, submitPasswordUpdate,
  newPassword, setNewPassword, confirmPassword, setConfirmPassword,
  showNewPassword, setShowNewPassword, showConfirmPassword, setShowConfirmPassword,
  passwordSubmitting, passwordError, setPasswordError,
}) {
  return (
    <Modal show={showPasswordModal} onHide={closePasswordModal} centered
      backdrop={passwordSubmitting ? "static" : true} keyboard={!passwordSubmitting}>
      <Form onSubmit={submitPasswordUpdate}>
        <Modal.Header closeButton={!passwordSubmitting}>
          <Modal.Title>Update Password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3" controlId="profile-update-password-new">
            <Form.Label>New Password</Form.Label>
            <div className="d-flex align-items-center gap-2">
              <Form.Control type={showNewPassword ? "text" : "password"} placeholder="Enter new password"
                value={newPassword} onChange={(e) => { setNewPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                autoComplete="new-password" required disabled={passwordSubmitting} />
              <Button type="button" variant="outline-secondary"
                onClick={() => setShowNewPassword((p) => !p)} disabled={passwordSubmitting}>
                {showNewPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </Form.Group>

          <Form.Group className="mb-0" controlId="profile-update-password-confirm">
            <Form.Label>Confirm Password</Form.Label>
            <div className="d-flex align-items-center gap-2">
              <Form.Control type={showConfirmPassword ? "text" : "password"} placeholder="Retype new password"
                value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                autoComplete="new-password" required disabled={passwordSubmitting} />
              <Button type="button" variant="outline-secondary"
                onClick={() => setShowConfirmPassword((p) => !p)} disabled={passwordSubmitting}>
                {showConfirmPassword ? "Hide" : "Show"}
              </Button>
            </div>
          </Form.Group>

          {passwordError ? (
            <div className="text-danger small mt-3" role="alert">{passwordError}</div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button type="button" variant="outline-secondary" onClick={closePasswordModal} disabled={passwordSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={passwordSubmitting}>
            {passwordSubmitting ? (
              <><Spinner size="sm" animation="border" className="me-2" />Updating...</>
            ) : "Confirm Update"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ── main view ──────────────────────────────────────────────
export default function ProfileView() {
  const h = useProfile();

  if (h.loading) {
    return <Container className="py-4">Loading profile...</Container>;
  }

  return (
    <Container className="py-4 profile-page-shell" style={{ maxWidth: 1120 }}>
      <div className="mb-3">
        <h2 className="mb-0">User Profile</h2>
        <p className="text-muted mb-0">Profile view for your account.</p>
      </div>

      <div className="profile-readonly-alert notice-banner notice-banner-info mb-3">
        Profile field updates are managed by administrators.
        You can update your password below.
      </div>

      {!h.hasAccess ? (
        <div className="notice-banner notice-banner-warning mb-3">
          Your account currently has no active app assignments.
        </div>
      ) : null}

      <Row className="g-3 align-items-start">
        <Col lg={4} className="profile-social-col" style={{ flex: "0 0 30%", maxWidth: "30%" }}>
          <ProfileSocialCard
            profile={h.profile} fullName={h.fullName} initials={h.initials}
            isActive={h.isActive} companyLabel={h.companyLabel} departmentLabel={h.departmentLabel}
            adminEmail={h.adminEmail} requestUpdateHref={h.requestUpdateHref}
            copyToClipboard={h.copyToClipboard}
          />
        </Col>
        <Col lg={6} style={{ flex: "0 0 50%", maxWidth: "50%" }}>
          <ProfileSummaryCard
            profile={h.profile} companyLabel={h.companyLabel} departmentLabel={h.departmentLabel}
            requestUpdateHref={h.requestUpdateHref}
            copyToClipboard={h.copyToClipboard}
          />
          <ProfileRequestCard
            requestUpdateHref={h.requestUpdateHref} openPasswordModal={h.openPasswordModal}
          />
        </Col>
        <Col lg={2} style={{ flex: "0 0 20%", maxWidth: "20%" }}>
          <ProfileRolesCard roleGroupsByApp={h.roleGroupsByApp} />
        </Col>
      </Row>

      <ProfilePasswordModal
        showPasswordModal={h.showPasswordModal} closePasswordModal={h.closePasswordModal}
        submitPasswordUpdate={h.submitPasswordUpdate}
        newPassword={h.newPassword} setNewPassword={h.setNewPassword}
        confirmPassword={h.confirmPassword} setConfirmPassword={h.setConfirmPassword}
        showNewPassword={h.showNewPassword} setShowNewPassword={h.setShowNewPassword}
        showConfirmPassword={h.showConfirmPassword} setShowConfirmPassword={h.setShowConfirmPassword}
        passwordSubmitting={h.passwordSubmitting} passwordError={h.passwordError}
        setPasswordError={h.setPasswordError}
      />
    </Container>
  );
}
