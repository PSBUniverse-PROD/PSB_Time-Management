"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, StatusBadge, toastError, toastSuccess } from "@/shared/components/ui";
import {
  loadDealerLoginAction,
  revealDealerPasswordAction,
  saveDealerLoginAction,
} from "../data/dealerMasterSetup.actions.js";
import { generateDealerPassword } from "../data/dealerMasterSetup.data.js";
import { errorFromResult, showDealerError } from "@/modules/dealer/data/dealerErrorReport";

const HIDDEN_PASSWORD = "••••••••••••";
const UNREADABLE_PASSWORD = "This password can't be shown. Use Update credentials to set a new one.";

function isLocked(account) {
  return Boolean(account?.locked_until) && new Date(account.locked_until).getTime() > Date.now();
}

// Saves on its own as soon as staff click Save. A dealer that has a
// login opens read-only; "Update credentials" switches to editing.
export default function DealerLoginModal({ dealer, onClose }) {
  const dealerId = dealer?.dealer_id;
  const [account, setAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // undefined = not fetched yet; null = no readable copy is stored.
  const [currentPassword, setCurrentPassword] = useState(undefined);
  const [isPasswordShown, setIsPasswordShown] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);

  const hasAccount = Boolean(account);
  const isFormOpen = !hasAccount || isEditing;

  useEffect(() => {
    let cancelled = false;
    loadDealerLoginAction(dealerId)
      .then((response) => {
        if (!response?.success) throw errorFromResult(response, "Failed to load dealer login.");
        if (!cancelled) setAccount(response.data || null);
      })
      .catch((error) => {
        if (cancelled) return;
        showDealerError(error, { title: "Dealer Login", action: "Opening the dealer's login details" });
        onClose?.();
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [dealerId, onClose]);

  const startEditing = useCallback(() => {
    setUsername(account?.username || "");
    setPassword("");
    setShowNewPassword(false);
    setIsActive(account ? account.is_active !== false : true);
    setIsEditing(true);
  }, [account]);

  // Asks the server only once per open window, and only when staff click Show or Copy.
  const fetchCurrentPassword = useCallback(async () => {
    if (currentPassword !== undefined) {
      if (!currentPassword) toastError(UNREADABLE_PASSWORD);
      return currentPassword;
    }
    setIsRevealing(true);
    try {
      const response = await revealDealerPasswordAction(dealerId);
      if (!response?.success) throw errorFromResult(response, "Failed to load the password.");
      const value = response.data;
      setCurrentPassword(value);
      if (!value) toastError(UNREADABLE_PASSWORD);
      return value;
    } catch (error) {
      showDealerError(error, { title: "Dealer Login", action: "Showing the dealer's password" });
      return null;
    } finally { setIsRevealing(false); }
  }, [currentPassword, dealerId]);

  const togglePassword = useCallback(async () => {
    if (isPasswordShown) {
      setIsPasswordShown(false);
      return;
    }
    if (await fetchCurrentPassword()) setIsPasswordShown(true);
  }, [fetchCurrentPassword, isPasswordShown]);

  const copyText = useCallback(async (text, label) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess(`${label} copied.`, "Dealer Login");
    } catch {
      toastError(`Unable to copy the ${label.toLowerCase()}.`);
    }
  }, []);

  const copyPassword = useCallback(async () => {
    const value = await fetchCurrentPassword();
    if (value) await copyText(value, "Password");
  }, [copyText, fetchCurrentPassword]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const saveResponse = await saveDealerLoginAction(dealerId, { username, password, isActive });
      if (!saveResponse?.success) throw errorFromResult(saveResponse, "Failed to save dealer login.");
      const result = saveResponse.data;
      // The save already went through. If the refresh fails, show what was saved.
      const refreshResponse = await loadDealerLoginAction(dealerId).catch(() => null);
      const refreshed = refreshResponse?.success ? refreshResponse.data : null;
      setAccount(refreshed || { ...result, has_password_copy: Boolean(password) || Boolean(account?.has_password_copy) });
      // A password typed here is the current one now, so Show needs no server call.
      if (password) setCurrentPassword(password);
      setIsPasswordShown(false);
      setIsEditing(false);
      toastSuccess(result?.created ? "Dealer login created." : "Dealer login updated.", "Dealer Login");
    } catch (error) {
      showDealerError(error, { title: "Dealer Login", action: "Saving the dealer's login" });
    } finally { setIsSaving(false); }
  }, [account, dealerId, isActive, isSaving, password, username]);

  const footer = isFormOpen ? (
    <>
      <Button type="button" variant="ghost" disabled={isSaving} onClick={hasAccount ? () => setIsEditing(false) : onClose}>
        {hasAccount ? "Cancel" : "Close"}
      </Button>
      <Button type="button" variant="primary" loading={isSaving} disabled={isLoading || isSaving} onClick={handleSave}>
        {hasAccount ? "Save changes" : "Create Login"}
      </Button>
    </>
  ) : (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
      <Button type="button" variant="primary" onClick={startEditing}>Update credentials</Button>
    </>
  );

  const locked = isLocked(account);
  const lastSignIn = account?.last_login_at ? new Date(account.last_login_at).toLocaleString() : null;

  return (
    <Modal show onHide={() => { if (!isSaving) onClose?.(); }} title={`Dealer login: ${dealer?.dealer_name || ""}`} footer={footer} backdrop="static">
      {isLoading ? <div className="small text-muted">Loading...</div> : isFormOpen ? (
        <div className="d-flex flex-column gap-3">
          <div className="small text-muted">
            {hasAccount
              ? "You are changing this dealer's login. Give the dealer the new details after you save."
              : "This dealer has no login yet. Set a username and password, then give them to the dealer."}
          </div>
          <div>
            <label className="form-label mb-1">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. acme-steel" autoComplete="off" autoFocus />
            <small className="text-muted d-block mt-1">3–50 characters: letters, numbers, dot, dash or underscore. Saved in lowercase.</small>
          </div>
          <div>
            <label className="form-label mb-1">{hasAccount ? "New password" : "Password"}</label>
            <div className="d-flex gap-2">
              <Input
                type={showNewPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasAccount ? "Leave empty to keep the current password" : "At least 8 characters"}
                autoComplete="new-password"
              />
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setShowNewPassword((shown) => !shown)}>
                {showNewPassword ? "Hide" : "Show"}
              </Button>
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => { setPassword(generateDealerPassword()); setShowNewPassword(true); }}>
                Generate
              </Button>
            </div>
            {locked ? <small className="text-muted d-block mt-1">Setting a new password also unlocks the login.</small> : null}
          </div>
          <label className="d-flex align-items-center gap-2 mb-0">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>Login is active</span>
          </label>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          <div className="d-flex flex-wrap align-items-center gap-2">
            <StatusBadge
              status={account.is_active === false ? "inactive" : "active"}
              label={account.is_active === false ? "Login disabled" : "Login active"}
            />
            {locked ? <StatusBadge status="suspended" label="Locked after wrong passwords" /> : null}
            <span className="small text-muted">{lastSignIn ? `Last sign-in: ${lastSignIn}` : "Not used yet"}</span>
          </div>
          <div>
            <label className="form-label mb-1">Username</label>
            <div className="d-flex gap-2">
              <Input value={account.username || ""} readOnly />
              <Button type="button" variant="secondary" onClick={() => copyText(account.username, "Username")}>Copy</Button>
            </div>
          </div>
          <div>
            <label className="form-label mb-1">Password</label>
            {account.has_password_copy ? (
              <>
                <div className="d-flex gap-2">
                  <Input value={isPasswordShown && currentPassword ? currentPassword : HIDDEN_PASSWORD} readOnly className="font-monospace" />
                  <Button type="button" variant="secondary" loading={isRevealing} onClick={togglePassword}>
                    {isPasswordShown ? "Hide" : "Show"}
                  </Button>
                  <Button type="button" variant="secondary" disabled={isRevealing} onClick={copyPassword}>Copy</Button>
                </div>
                <small className="text-muted d-block mt-1">Visible to PSB staff only. Share it only with the dealer.</small>
              </>
            ) : (
              <small className="text-muted d-block">
                This password was set before passwords could be shown. Use Update credentials to set a new one; it can be shown after that.
              </small>
            )}
          </div>
          {locked ? <div className="small text-muted">Setting a new password also unlocks the login.</div> : null}
        </div>
      )}
    </Modal>
  );
}
