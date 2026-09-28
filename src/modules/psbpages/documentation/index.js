const documentationModule = {
  key: "documentation",
  module_key: "psbuniverse",
  name: "Documentation",
  description: "Project documentation and developer guide.",
  icon: "book",
  group_name: "System",
  group_desc: "Core system pages.",
  order: 40,
  public: true,
  routes: [
    { path: "/psbpages/documentation", page: "DocumentationPage" },
  ],
};

export default documentationModule;
