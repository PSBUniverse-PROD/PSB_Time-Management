const userMasterSetupModule = {
  key: "user-master-setup",
  module_key: "psbuniverse",
  name: "User Master Setup",
  description: "Manage user master records and activation status.",
  icon: "users",
  group_name: "Administration",
  group_desc: "Internal setup tools for user administration.",
  order: 110,
  routes: [
    { path: "/admin/user-master-setup", page: "UserMasterSetupPage" },
  ],
};

export default userMasterSetupModule;
