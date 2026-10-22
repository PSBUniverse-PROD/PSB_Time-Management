"use client";

import { useState } from "react";
import Image from "next/image";
import dealerIcon from "@/styles/psb_dealer_icon.svg";
import "../dealerPortal.css";

const ACCOUNT_NAV = [
  { key: "overview", label: "Overview" },
  { key: "company", label: "Company" },
  { key: "contacts", label: "Contacts" },
  { key: "address", label: "Address" },
  { key: "security", label: "Login & security" },
];

// Planned sections. Shown so dealers know they are coming; not selectable yet.
const LATER_NAV = ["Quotes", "Invoices", "Documents"];

/**
 * Frame for the signed-in dealer area: one full-height sidebar (brand, dealer
 * identity, navigation, sign-out) beside the selected section. There is no top
 * bar. `active` is the current section key and `onSelect(key)` switches
 * section; nothing here navigates to another page except Logout.
 */
export default function DealerShell({ dealer, username, active, onSelect, children }) {
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/dealer/logout", { method: "POST" });
    } finally {
      window.location.assign("/dealer/login");
    }
  }

  const isSupport = active === "support";

  return (
    <div className="dp-app dp-layout">
      <aside className="dp-sidebar">
        <div className="dp-brand">
          <Image src={dealerIcon} alt="" className="dp-logo" />
          <div>
            <div className="dp-title">PSBUniverse</div>
            <div className="dp-subtitle">Dealer Portal</div>
          </div>
        </div>

        <div className="dp-sidebar-dealer">
          <div className="dp-sidebar-dealer-text">
            <div className="dp-who-name">{dealer?.dealer_name || "Dealer account"}</div>
            <div className="dp-who-meta">Dealer <span className="dp-chip">{dealer?.dealer_code || "--"}</span></div>
            <span className="dp-pill dp-pill-good">Active dealer</span>
          </div>
        </div>

        <nav className="dp-nav" aria-label="Account sections">
          <div className="dp-nav-title">Account</div>
          {ACCOUNT_NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`dp-nav-item${active === item.key ? " is-active" : ""}`}
              aria-current={active === item.key ? "page" : undefined}
              onClick={() => onSelect?.(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <nav className="dp-nav" aria-label="Business">
          <div className="dp-nav-title">Business</div>
          <button
            type="button"
            className={`dp-nav-item${active === "projects" ? " is-active" : ""}`}
            aria-current={active === "projects" ? "page" : undefined}
            onClick={() => onSelect?.("projects")}
          >
            Projects
          </button>
          {LATER_NAV.map((label) => (
            <span key={label} className="dp-nav-item is-later">
              {label} <span className="dp-nav-tag">Locked</span>
            </span>
          ))}
        </nav>

        <nav className="dp-nav" aria-label="Help">
          <div className="dp-nav-title">Help</div>
          <button
            type="button"
            className={`dp-nav-item${isSupport ? " is-active" : ""}`}
            aria-current={isSupport ? "page" : undefined}
            onClick={() => onSelect?.("support")}
          >
            Contact PSB
          </button>
        </nav>

        <div className="dp-sidebar-foot">
          <div className="dp-who-meta">Signed in as <span className="dp-mono">{username}</span></div>
          <button type="button" className="dp-logout" onClick={handleLogout} disabled={signingOut}>
            {signingOut ? "Signing out..." : "Logout"}
          </button>
          <div className="dp-sidebar-note">Premium Steel Buildings Inc.</div>
        </div>
      </aside>

      <div className="dp-main dp-content">{children}</div>
    </div>
  );
}
