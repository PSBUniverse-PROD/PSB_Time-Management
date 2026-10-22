"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * A dealer's projects from every PSBUniverse application. The records are read
 * live by the server each time the page loads; Refresh re-reads them without
 * leaving the section.
 */
export default function DealerProjects({ records }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const list = Array.isArray(records) ? records : [];

  return (
    <section className="dp-page">
      <div className="dp-page-head">
        <div>
          <h1>Projects</h1>
          <p>Projects PSB has linked to your dealership. Details are read live, so what you see here is current.</p>
        </div>
        <div className="dp-actions">
          <button type="button" className="dp-btn" disabled={isRefreshing} onClick={() => startRefresh(() => router.refresh())}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dp-panel">
        <div className="dp-panel-head">
          <h2>Your projects</h2>
          <span className="dp-pill">{list.length} {list.length === 1 ? "project" : "projects"}</span>
        </div>

        {list.length === 0 ? (
          <p className="dp-file-empty">No projects are linked to your dealership yet.</p>
        ) : (
          <ul className="dp-record-list">
            {list.map((record) => (
              <li key={record.key}>
                <details className="dp-record">
                  <summary>
                    <div className="dp-record-main">
                      <div className="dp-record-title">{record.title}</div>
                      <div className="dp-file-meta">
                        {[record.recordLabel, record.location, record.reference ? `Invoice ${record.reference}` : ""].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <div className="dp-record-side">
                      {record.status ? <span className="dp-pill">{record.status}</span> : null}
                      {record.dateText ? <span className="dp-file-meta">{record.dateText}</span> : null}
                      {record.amountText ? <span className="dp-record-amount dp-mono">{record.amountText}</span> : null}
                    </div>
                  </summary>
                  <dl className="dp-kv dp-record-details">
                    {record.details.filter(([, value]) => value).map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>Source</dt>
                      <dd>{record.appLabel}</dd>
                    </div>
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
