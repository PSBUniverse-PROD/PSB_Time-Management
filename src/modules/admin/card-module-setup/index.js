const cardModuleSetupModule = {
  key: "card-module-setup",
  module_key: "psbuniverse",
  name: "Card Module Setup",
  description: "Configure application card groups and cards.",
  icon: "list-check",
  group_name: "Administration",
  group_desc: "Tools for system configuration and management.",
  order: 130,
  routes: [
    { path: "/admin/card-module-setup", page: "CardModuleSetupPage" },
  ],
};

export default cardModuleSetupModule;
