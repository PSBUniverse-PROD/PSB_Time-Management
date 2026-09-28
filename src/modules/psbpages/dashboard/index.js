const dashboardModule = {
  key: "dashboard",
  module_key: "psbuniverse",
  name: "Dashboard",
  description: "Main dashboard with module cards.",
  icon: "table-cells",
  group_name: "System",
  group_desc: "Core system pages.",
  order: 10,
  public: true,
  routes: [
    { path: "/psbpages/dashboard", page: "DashboardPage" },
  ],
};

export default dashboardModule;
