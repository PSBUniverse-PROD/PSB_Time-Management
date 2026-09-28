const loginModule = {
  key: "login",
  module_key: "psbuniverse",
  name: "Login",
  description: "Authentication page.",
  icon: "right-to-bracket",
  group_name: "System",
  group_desc: "Core system pages.",
  order: 1,
  public: true,
  routes: [
    { path: "/psbpages/login", page: "LoginPage" },
  ],
};

export default loginModule;
