const profileModule = {
  key: "profile",
  module_key: "psbuniverse",
  name: "Profile",
  description: "User profile management.",
  icon: "circle-user",
  group_name: "System",
  group_desc: "Core system pages.",
  order: 20,
  public: true,
  routes: [
    { path: "/psbpages/profile", page: "ProfilePage" },
  ],
};

export default profileModule;
