"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import DealerShell from "./DealerShell";
import DealerProfileForm from "./DealerProfileForm";
import DealerAddressForm from "./DealerAddressForm";
import DealerPasswordForm from "./DealerPasswordForm";
import DealerAttachments from "./DealerAttachments";
import DealerProjects from "./DealerProjects";
import DealerAccountView from "../pages/DealerAccountView";
import { COMPANY_FIELDS, CONTACT_FIELDS } from "../data/dealerPortal.data";

const SECTIONS = ["overview", "company", "contacts", "address", "security", "projects", "support"];
const PSB_CONTACT = { email: "Sales.pgd@premiumsteelgroup.com", phone: "817-502-2520" };

// The current section is the address bar's hash (/dealer/account#company), so
// refresh, back/forward and plain "#section" links all work without extra state.
function subscribeToHash(callback) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function readSectionFromHash() {
  const key = window.location.hash.replace(/^#/, "");
  return SECTIONS.includes(key) ? key : "overview";
}

function readSectionOnServer() {
  return "overview";
}

/**
 * The whole dealer account area on one page. Every section is rendered once
 * and only the selected one is shown, so switching is instant and unsaved
 * typing in another section is kept. Data comes from the server page and is
 * refreshed by router.refresh() inside the forms after a save.
 */
export default function DealerAccountWorkspace({
  dealer,
  username,
  states,
  creditLimitText,
  dealerSinceText,
  lastLoginText,
  lockAttempts,
  lockMinutes,
  files,
  projects,
}) {
  const section = useSyncExternalStore(subscribeToHash, readSectionFromHash, readSectionOnServer);

  const selectSection = useCallback((key) => {
    window.location.hash = key;
  }, []);

  const companyValues = useMemo(() => ({
    dealer_name: dealer.dealer_name ?? "",
    dealer_code: dealer.dealer_code ?? "",
    tax_id: dealer.tax_id ?? "",
    payment_terms: dealer.payment_terms ?? "",
    credit_limit: creditLimitText || "",
  }), [dealer, creditLimitText]);

  const contactValues = useMemo(() => ({
    contact_person: dealer.contact_person ?? "",
    email: dealer.email ?? "",
    phone: dealer.phone ?? "",
    mobile: dealer.mobile ?? "",
  }), [dealer]);

  const addressValues = useMemo(() => ({
    address_line1: dealer.address_line1 ?? "",
    address_line2: dealer.address_line2 ?? "",
    state: dealer.state ?? "",
    city: dealer.city ?? "",
    postal_code: dealer.postal_code ?? "",
    country: dealer.country ?? "US",
  }), [dealer]);

  return (
    <DealerShell dealer={dealer} username={username} active={section} onSelect={selectSection}>
      <div hidden={section !== "overview"}>
        <DealerAccountView
          dealer={dealer}
          creditLimitText={creditLimitText}
          dealerSinceText={dealerSinceText}
          lastLoginText={lastLoginText}
        />
      </div>

      <div hidden={section !== "company"}>
        <section className="dp-page">
          <div className="dp-page-head">
            <div>
              <h1>Company profile</h1>
              <p>Details about your business. Fields marked &quot;Set by PSB&quot; can only be changed by PSB staff.</p>
            </div>
          </div>
          <DealerProfileForm section="company" title="Business details" fields={COMPANY_FIELDS} initialValues={companyValues} />
          <DealerAttachments initialFiles={files} />
        </section>
      </div>

      <div hidden={section !== "contacts"}>
        <section className="dp-page">
          <div className="dp-page-head">
            <div>
              <h1>Contacts</h1>
              <p>Who PSB should reach about orders, quotes and paperwork.</p>
            </div>
          </div>
          <DealerProfileForm section="contacts" title="Primary contact" fields={CONTACT_FIELDS} initialValues={contactValues} />
        </section>
      </div>

      <div hidden={section !== "address"}>
        <section className="dp-page">
          <div className="dp-page-head">
            <div>
              <h1>Address</h1>
              <p>Your business address. Pick the state first, then the city and ZIP code.</p>
            </div>
          </div>
          <DealerAddressForm initialValues={addressValues} states={states} />
        </section>
      </div>

      <div hidden={section !== "security"}>
        <section className="dp-page">
          <div className="dp-page-head">
            <div>
              <h1>Login &amp; security</h1>
              <p>Your dealership has one login. Keep the password private and change it if someone leaves your team.</p>
            </div>
          </div>
          <div className="dp-split">
            <DealerPasswordForm />
            <div className="dp-stack">
              <div className="dp-panel">
                <div className="dp-panel-head"><h2>Login details</h2></div>
                <div className="dp-panel-body">
                  <dl className="dp-kv is-single">
                    <div><dt>Username</dt><dd className="dp-mono">{username}</dd></div>
                    <div><dt>Last sign-in</dt><dd>{lastLoginText || "--"} Central Time</dd></div>
                  </dl>
                </div>
              </div>
              <div className="dp-panel">
                <div className="dp-panel-head"><h2>Good to know</h2></div>
                <div className="dp-panel-body dp-muted-list">
                  <p>{lockAttempts} wrong passwords in a row lock the login for {lockMinutes} minute(s).</p>
                  <p>Forgot your password? PSB staff can reset it and send you a new one.</p>
                  <p>Your username is set by PSB and can&apos;t be changed here.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div hidden={section !== "projects"}>
        <DealerProjects records={projects} />
      </div>

      <div hidden={section !== "support"}>
        <section className="dp-page">
          <div className="dp-page-head">
            <div>
              <h1>Contact PSB</h1>
              <p>Need a password reset, a change to your terms, or help with your account? Reach your PSB contact directly.</p>
            </div>
          </div>
          <div className="dp-panel" style={{ maxWidth: 520 }}>
            <div className="dp-panel-head"><h2>Premium Steel Buildings Inc.</h2></div>
            <div className="dp-panel-body dp-stack">
              <div className="dp-contact"><span>Email</span><strong>{PSB_CONTACT.email}</strong></div>
              <div className="dp-contact"><span>Phone</span><strong className="dp-mono">{PSB_CONTACT.phone}</strong></div>
              <div className="dp-contact"><span>Quote your dealer code</span><strong className="dp-mono">{dealer.dealer_code || "--"}</strong></div>
            </div>
          </div>
        </section>
      </div>
    </DealerShell>
  );
}
