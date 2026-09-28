const applicationSetupModule = {
  key: "application-setup",
  module_key: "psbuniverse",
  name: "Application Setup",
  description: "Configure and manage application settings.",
  icon: "gear",
  group_name: "Administration",
  group_desc: "Tools for system configuration and management.",
  order: 100,
  routes: [
    { path: "/admin/application-setup", page: "ApplicationSetupPage" },
  ],
};

export default applicationSetupModule;
