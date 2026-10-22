import { PROFILE_CHECKLIST, hasText } from "../data/dealerPortal.data";

const PSB_CONTACT = { email: "Sales.pgd@premiumsteelgroup.com", phone: "817-502-2520" };

function show(value) {
  return hasText(value) ? String(value).trim() : null;
}

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={value ? (mono ? "dp-mono" : undefined) : "is-empty"}>{value || "Not provided"}</dd>
    </div>
  );
}

/** Overview: profile checklist, summary cards and account facts. */
export default function DealerAccountView({ dealer, creditLimitText, dealerSinceText, lastLoginText }) {
  const items = PROFILE_CHECKLIST.map((item) => ({ ...item, done: hasText(dealer?.[item.key]) }));
  const doneCount = items.filter((item) => item.done).length;
  const missing = items.filter((item) => !item.done);
  const percent = Math.round((doneCount / items.length) * 100);
  const cityLine = [show(dealer?.city), [show(dealer?.state), show(dealer?.postal_code)].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  return (
    <section className="dp-page">
      <div className="dp-page-head">
        <div>
          <h1>Account overview</h1>
          <p>Everything PSB has on file for your dealership. Keep it current so quotes, paperwork and deliveries go to the right place.</p>
        </div>
        <div className="dp-actions">
          <a href="#security" className="dp-btn">Change password</a>
          <a href="#company" className="dp-btn dp-btn-primary">Edit account</a>
        </div>
      </div>

      <div className="dp-split">
        <div className="dp-stack">
          <div className="dp-panel">
            <div className="dp-panel-head">
              <div>
                <h2>{missing.length ? "Finish your profile" : "Your profile is complete"}</h2>
                <p>{doneCount} of {items.length} details filled in</p>
              </div>
              {missing.length ? <span className="dp-pill dp-pill-warn">{missing.length} missing</span> : <span className="dp-pill dp-pill-good">Complete</span>}
            </div>
            <div className="dp-panel-body dp-stack">
              <div className="dp-meter" role="img" aria-label={`Profile ${percent} percent complete`}><span style={{ width: `${percent}%` }} /></div>
              {missing.length ? (
                <ul className="dp-todo">
                  {missing.map((item) => (
                    <li key={item.key}>
                      <span className="dp-todo-label"><span className="dp-tick" />{item.label}</span>
                      <a href={item.href} className="dp-link">Add</a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <div className="dp-panel">
            <div className="dp-panel-head"><h2>Company</h2>            <a href="#company" className="dp-link">Edit</a></div>            <div className="dp-panel-body">
              <dl className="dp-kv">
                <Detail label="Dealer name" value={show(dealer?.dealer_name)} />
                <Detail label="Dealer code" value={show(dealer?.dealer_code)} mono />
                <Detail label="Tax ID" value={show(dealer?.tax_id)} />
                <Detail label="Payment terms" value={show(dealer?.payment_terms)} />
              </dl>
            </div>
          </div>

          <div className="dp-grid-2">
            <div className="dp-panel">
              <div className="dp-panel-head"><h2>Primary contact</h2>              <a href="#contacts" className="dp-link">Edit</a></div>              <div className="dp-panel-body">
                <dl className="dp-kv is-single">
                  <Detail label="Contact person" value={show(dealer?.contact_person)} />
                  <Detail label="Email" value={show(dealer?.email)} />
                  <Detail label="Phone" value={show(dealer?.phone)} mono />
                </dl>
              </div>
            </div>
            <div className="dp-panel">
              <div className="dp-panel-head"><h2>Address</h2>              <a href="#address" className="dp-link">Edit</a></div>              <div className="dp-panel-body">
                <dl className="dp-kv is-single">
                  <Detail label="Street" value={[show(dealer?.address_line1), show(dealer?.address_line2)].filter(Boolean).join(", ") || null} />
                  <Detail label="City, state, ZIP" value={cityLine || null} />
                  <Detail label="Country" value={show(dealer?.country)} />
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="dp-stack">
          <div className="dp-panel">
            <div className="dp-stat">
              <div className="dp-stat-label">Account status</div>
              <div className="dp-stat-value">Active</div>
              {dealerSinceText ? <div className="dp-stat-note">Dealer since {dealerSinceText}</div> : null}
            </div>
          </div>
          <div className="dp-panel">
            <div className="dp-stat">
              <div className="dp-stat-label">Credit limit</div>
              <div className="dp-stat-value dp-mono">{creditLimitText || "Not set"}</div>
              <div className="dp-stat-note">Set by PSB. Ask your PSB contact to review it.</div>
            </div>
          </div>
          <div className="dp-panel">
            <div className="dp-stat">
              <div className="dp-stat-label">Last sign-in</div>
              <div className="dp-stat-value">{lastLoginText || "--"}</div>
              <div className="dp-stat-note">Central Time (Dallas)</div>
            </div>
          </div>
          <div className="dp-panel">
            <div className="dp-panel-head"><h2>Your PSB contact</h2></div>
            <div className="dp-panel-body dp-stack">
              <div className="dp-contact"><span>Email</span><strong>{PSB_CONTACT.email}</strong></div>
              <div className="dp-contact"><span>Phone</span><strong className="dp-mono">{PSB_CONTACT.phone}</strong></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
