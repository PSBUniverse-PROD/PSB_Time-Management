const workflowSetupModule = {
  key: "workflow-setup",
  module_key: "psbuniverse",
  name: "Workflow Setup",
  description: "Manage workflow configurations.",
  icon: "box",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 160,
  routes: [
    { path: "/admin/workflow-setup", page: "WorkflowPage" },
  ],
};

export default workflowSetupModule;
