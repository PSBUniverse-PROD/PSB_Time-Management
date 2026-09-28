const companyDepartmentSetupModule = {
  key: "company-department-setup",
  module_key: "psbuniverse",
  name: "Company Department Setup",
  description: "Configure companies and company-linked departments.",
  icon: "sitemap",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 120,
  routes: [
    { path: "/admin/company-department-setup", page: "CompanyDepartmentSetupPage" },
  ],
};

export default companyDepartmentSetupModule;

