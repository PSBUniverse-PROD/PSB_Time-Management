const statusSetupModule = {
  key: "status-setup",
  module_key: "psbuniverse",
  name: "Status Setup",
  description: "Configure system statuses.",
  icon: "tags",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 140,
  routes: [
    { path: "/admin/status-setup", page: "StatusSetupPage" },
  ],
};

export default statusSetupModule;
