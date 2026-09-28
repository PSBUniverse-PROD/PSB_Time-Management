const examplesModule = {
  key: "examples",
  module_key: "psbuniverse",
  name: "Examples",
  description: "Component examples and demos.",
  icon: "code",
  group_name: "System",
  group_desc: "Core system pages.",
  order: 30,
  public: true,
  routes: [
    { path: "/psbpages/examples/data-table", page: "data-table/DataTablePage" },
    { path: "/psbpages/examples", page: "ExamplesPage" },
  ],
};

export default examplesModule;
