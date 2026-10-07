const dealerMasterSetupModule = {
  key: "dealer-master-setup",
  module_key: "psbuniverse",
  name: "Dealer Master Setup",
  description: "Manage dealer master records.",
  icon: "store",
  group_name: "Administration",
  group_desc: "Tools for organization setup and management.",
  order: 150,
  routes: [
    { path: "/admin/dealer-master-setup", page: "DealerMasterSetupPage" },
  ],
};

export default dealerMasterSetupModule;
