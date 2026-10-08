/**
 * Client Component — WorkflowView.jsx
 *
 * Consolidated tabbed view for all workflow configuration tables.
 * Uses a single side-nav tab switcher and renders the embeddable
 * sections (WorkflowSetupView, ReferenceTableView, MappingTableView)
 * inside the content pane.
 */
"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import WorkflowSideNav, { WORKFLOW_TABS } from "../components/WorkflowSideNav";
import WorkflowSetupView from "./WorkflowSetupView";
import ReferenceTableView from "../components/ReferenceTableView";
import MappingTableView from "../components/MappingTableView";
import OrgRoleSetupView from "../components/OrgRoleSetupView";
import { REF_ACTIONS } from "../data/reference.data";

const WORKFLOW_TAB_KEY = "workflows";

export default function WorkflowView({
  workflows = [],
  stages = [],
  stageTypes = [],
  approvalTypes = [],
  orgRoles = [],
  stageParticipants = [],
  users = [],
  userOrgRoles = [],
  companies = [],
  departments = [],
  apps = [],
  statuses = [],
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = useMemo(() => {
    const fromQuery = searchParams?.get("tab");
    if (fromQuery && WORKFLOW_TABS.some((t) => t.key === fromQuery)) return fromQuery;
    return WORKFLOW_TAB_KEY;
  }, [searchParams]);

  const handleSelectTab = useCallback((key) => {
    const p = new URLSearchParams(searchParams?.toString() || "");
    p.delete("wf");
    if (key === WORKFLOW_TAB_KEY) p.delete("tab");
    else p.set("tab", key);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const getUserLabel = (user) => {
    const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    return fullName ? `${fullName} (${user?.username || ""})` : (user?.username || "Unknown");
  };

  const stageParticipantConfig = useMemo(() => ({
    idField: "stageparticipant_id",
    title: "Stage Participants",
    subtitle: "Map approval participants to workflow stages.",
    addLabel: "+ Add Participant",
    actions: REF_ACTIONS.stageparticipant,
    selectColumns: [
      { field: "wfs_id", label: "Stage", required: true, width: "30%", options: stages.map((s) => ({ value: s.wfs_id, label: s.stage_name })) },
      { field: "orgrole_id", label: "Org Role", required: false, width: "24%", options: orgRoles.map((r) => ({ value: r.orgrole_id, label: r.name })) },
      { field: "approvaltype_id", label: "Approval Type", required: false, width: "24%", options: approvalTypes.map((a) => ({ value: a.approvaltype_id, label: a.approvaltype_name })) },
    ],
  }), [stages, orgRoles, approvalTypes]);

  const userOrgRoleConfig = useMemo(() => ({
    idField: "user_orgrole_id",
    title: "User Org Roles",
    subtitle: "Map users to organizational roles.",
    addLabel: "+ Add User Role",
    actions: REF_ACTIONS.userorgrole,
    selectColumns: [
      { field: "user_id", label: "User", required: true, width: "36%", options: users.map((u) => ({ value: u.user_id, label: getUserLabel(u) })) },
      { field: "role_id", label: "Org Role", required: true, width: "34%", options: orgRoles.map((r) => ({ value: r.orgrole_id, label: r.name })) },
    ],
    booleanColumns: [
      { key: "is_primary", field: "is_primary", label: "Primary", width: "10%", align: "center" },
    ],
  }), [users, orgRoles]);

  const refConfig = {
    "stage-types": {
      idField: "stagetype_id",
      nameField: "stagetype_name",
      descField: "stagetype_description",
      nameLabel: "Stage Type Name",
      descLabel: "Description",
      title: "Stage Types",
      subtitle: "Manage workflow stage type reference records.",
      addLabel: "+ Add Stage Type",
      actions: REF_ACTIONS.stagetype,
    },
    "approval-types": {
      idField: "approvaltype_id",
      nameField: "approvaltype_name",
      descField: "approvaltype_description",
      nameLabel: "Approval Type Name",
      descLabel: "Description",
      title: "Approval Types",
      subtitle: "Manage workflow approval type reference records.",
      addLabel: "+ Add Approval Type",
      actions: REF_ACTIONS.approvaltype,
    },
    "status": {
      idField: "status_id",
      nameField: "status_name",
      descField: "status_description",
      nameLabel: "Status Name",
      descLabel: "Description",
      title: "Status Configuration",
      subtitle: "Manage workflow status reference records.",
      addLabel: "+ Add Status",
      actions: REF_ACTIONS.status,
    },
  };

  let content = null;

  if (activeTab === "workflows") {
    content = (
      <WorkflowSetupView
        workflows={workflows}
        stages={stages}
        stageTypes={stageTypes}
        orgRoles={orgRoles}
        companies={companies}
        departments={departments}
        apps={apps}
        approvalTypes={approvalTypes}
        stageParticipants={stageParticipants}
        userOrgRoles={userOrgRoles}
        users={users}
        embedded
      />
    );
  } else if (activeTab === "stage-participants") {
    content = (
      <MappingTableView
        items={stageParticipants}
        config={stageParticipantConfig}
        embedded
      />
    );
  } else if (activeTab === "user-org-roles") {
    content = (
      <MappingTableView
        items={userOrgRoles}
        config={userOrgRoleConfig}
        embedded
      />
    );
  } else if (activeTab === "org-roles") {
    content = (
      <OrgRoleSetupView
        orgRoles={orgRoles}
        userOrgRoles={userOrgRoles}
        users={users}
        embedded
      />
    );
  } else {
    const config = refConfig[activeTab];
    const itemsMap = {
      "stage-types": stageTypes,
      "approval-types": approvalTypes,
      "status": statuses,
    };
    content = (
      <ReferenceTableView
        items={itemsMap[activeTab] || []}
        config={config}
        embedded
      />
    );
  }

  return (
    <main className="container-fluid py-4">
      <div className="d-flex align-items-center mb-3">
        <div>
          <h1 className="h3 mb-0">Workflow Configuration</h1>
          <p className="text-muted mb-0">Manage workflow tables and setup configurations.</p>
        </div>
      </div>

      <div className="setup-split-layout">
        <WorkflowSideNav activeTab={activeTab} onSelectTab={handleSelectTab} />

        <div className="setup-content-pane">
          {content}
        </div>
      </div>
    </main>
  );
}