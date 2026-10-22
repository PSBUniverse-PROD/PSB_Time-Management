"use client";

import { useState } from "react";
import { toastError, toastSuccess } from "@/shared/components/ui";
import { changeDealerPasswordAction } from "../data/dealerPortal.actions";

const TITLE = "Change password";
const MIN_LENGTH = 8;

export default function DealerPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const longEnough = newPassword.length >= MIN_LENGTH;
  const different = newPassword !== "" && newPassword !== currentPassword;
  const matches = newPassword !== "" && newPassword === confirmPassword;
  const canSave = Boolean(currentPassword) && longEnough && different && matches && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await changeDealerPasswordAction({ currentPassword, newPassword });
      if (!result?.success) {
        toastError(result?.error || "Unable to update your password.", TITLE);
        return;
      }
      toastSuccess("Your password has been updated.", TITLE);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toastError("Unable to update your password. Please try again.", TITLE);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="dp-panel" onSubmit={handleSubmit} noValidate>
      <div className="dp-panel-head"><h2>{TITLE}</h2></div>
      <div className="dp-panel-body dp-stack">
        <div className="dp-form-grid is-single">
          <div className="dp-field">
            <label htmlFor="dp-password-current">Current password</label>
            <input id="dp-password-current" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-password-new">New password</label>
            <input id="dp-password-new" type="password" autoComplete="new-password" maxLength={72} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <div className="dp-field">
            <label htmlFor="dp-password-confirm">Confirm new password</label>
            <input id="dp-password-confirm" type="password" autoComplete="new-password" maxLength={72} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </div>
        </div>
        <ul className="dp-rules">
          <li className={longEnough ? "is-ok" : ""}>At least {MIN_LENGTH} characters</li>
          <li className={different ? "is-ok" : ""}>Different from your current password</li>
          <li className={matches ? "is-ok" : ""}>Both new password boxes match</li>
        </ul>
      </div>
      <div className="dp-panel-foot">
        <button type="submit" className="dp-btn dp-btn-primary" disabled={!canSave}>{saving ? "Updating..." : "Update password"}</button>
      </div>
    </form>
  );
}
