"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const WORKFLOW_TABS = [
  { key: "workflows", label: "Workflows", icon: "diagram-3" },
  { key: "stage-types", label: "Stage Types", icon: "list" },
  { key: "approval-types", label: "Approval Types", icon: "check-circle" },
  { key: "status", label: "Status", icon: "flag" },
  { key: "org-roles", label: "Org Roles", icon: "people" },
  { key: "stage-participants", label: "Stage Participants", icon: "person-badge" },
  { key: "user-org-roles", label: "User Org Roles", icon: "person-lines-fill" },
];

export default function WorkflowSideNav({ activeTab = "workflows", onSelectTab }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = (key) => {
    if (onSelectTab) {
      onSelectTab(key);
      return;
    }
    // Fallback: update the ?tab= query param
    const p = new URLSearchParams(searchParams?.toString() || "");
    p.delete("wf");
    if (key === "workflows") p.delete("tab");
    else p.set("tab", key);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  return (
    <aside className="setup-side-nav" aria-label="Workflow configuration">
      <p className="setup-side-nav-label">Workflow Setup</p>
      <div className="setup-side-nav-list">
        {WORKFLOW_TABS.map((item) => {
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelect(item.key)}
              className={`setup-side-nav-item is-button${isActive ? " is-active" : ""}`}
            >
              <span className="setup-side-nav-item-main">
                <span className="setup-side-nav-item-title">{item.label}</span>
              </span>
              <span className="setup-side-nav-item-end">
                <i className="fa-solid fa-chevron-right fa-xs" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}