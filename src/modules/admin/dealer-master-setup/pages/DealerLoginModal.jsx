"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, toastError, toastSuccess } from "@/shared/components/ui";
import { loadDealerLoginAction, saveDealerLoginAction } from "../data/dealerMasterSetup.actions.js";

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?";

function generatePassword(length = 16) {
  const values = new Uint32Array(length);
  window.crypto.getRandomValues(values);
  return Array.from(values, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join("");
}

// Saves on its own, independent of the page's Save Batch.
export default function DealerLoginModal({ dealer, onClose }) {
  const dealerId = dealer?.dealer_id;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [hasAccount, setHasAccount] = useState(false);
  const [lastLoginAt, setLastLoginAt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadDealerLoginAction(dealerId)
      .then((account) => {
        if (cancelled) return;
        setHasAccount(Boolean(account));
        setUsername(account?.username || "");
        setIsActive(account ? account.is_active !== false : true);
        setLastLoginAt(account?.last_login_at || null);
      })
      .catch((error) => {
        if (cancelled) return;
        toastError(error?.message || "Failed to load dealer login.");
        onClose?.();
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [dealerId, onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveDealerLoginAction(dealerId, { username, password, isActive });
      setHasAccount(true);
      toastSuccess(result?.created ? "Dealer login created." : "Dealer login updated.", "Dealer Login");
    } catch (error) {
      toastError(error?.message || "Failed to save dealer login.");
    } finally { setIsSaving(false); }
  }, [dealerId, isActive, isSaving, password, username]);

  const footer = (
    <>
      <Button type="button" variant="ghost" disabled={isSaving} onClick={onClose}>Close</Button>
      <Button type="button" variant="primary" loading={isSaving} disabled={isLoading || isSaving} onClick={handleSave}>
        {hasAccount ? "Save" : "Create Login"}
      </Button>
    </>
  );

  return (
    <Modal show onHide={() => { if (!isSaving) onClose?.(); }} title={`Dealer login: ${dealer?.dealer_name || ""}`} footer={footer} backdrop="static">
      {isLoading ? <div className="small text-muted">Loading...</div> : (
        <div className="d-flex flex-column gap-3">
          <div className="small text-muted">
            {hasAccount
              ? `This dealer has a login.${lastLoginAt ? ` Last sign-in: ${new Date(lastLoginAt).toLocaleString()}.` : " It has not been used yet."}`
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
              <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder={hasAccount ? "Leave empty to keep the current password" : "At least 8 characters"} autoComplete="off" />
              <Button type="button" variant="secondary" disabled={isSaving} onClick={() => setPassword(generatePassword())}>Generate</Button>
            </div>
            <small className="text-muted d-block mt-1">Copy it before closing. It is stored scrambled and cannot be shown again.</small>
          </div>
          <label className="d-flex align-items-center gap-2 mb-0">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <span>Login is active</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
