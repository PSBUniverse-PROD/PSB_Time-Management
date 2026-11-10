const orgChartModule = {
  key: "org-chart",
  module_key: "psbuniverse",
  name: "Org Chart",
  description: "See who reports to whom in each company.",
  icon: "people-group",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 125,
  routes: [
    { path: "/admin/org-chart", page: "OrgChartPage" },
  ],
};

export default orgChartModule;
