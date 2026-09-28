const ENV = process.env.NEXT_PUBLIC_ENV;

const CONFIG = {
  local: {
    baseUrl: "http://localhost:3000",
    modules: {
      gutter: "http://localhost:3001",
    },
  },
  dev: {
    baseUrl: "https://psbuniverse-dev.vercel.app",
    modules: {
      gutter: "https://gutter-dev.vercel.app",
    },
  },
  prod: {
    baseUrl: "https://www.psbuniverse.com",
    modules: {
      gutter: "https://gutter.psbuniverse.com",
    },
  },
};

export const APP_CONFIG = CONFIG[ENV] || CONFIG.local;

function ensurePath(pathname = "/") {
  const value = String(pathname || "").trim();
  if (!value) return "/";
  if (value.startsWith("/")) return value;
  return `/${value.replace(/^\/+/, "")}`;
}

function stripTrailingSlash(url = "") {
  return String(url || "").replace(/\/+$/, "");
}

export function buildAbsoluteAppUrl(pathname = "/") {
  return `${stripTrailingSlash(APP_CONFIG.baseUrl)}${ensurePath(pathname)}`;
}

export function buildModuleUrl(moduleKey, pathname = "/") {
  const key = String(moduleKey || "").trim().toLowerCase();
  const moduleBaseUrl = String(APP_CONFIG.modules?.[key] || "").trim();
  if (!moduleBaseUrl) return "";
  return `${stripTrailingSlash(moduleBaseUrl)}${ensurePath(pathname)}`;
}