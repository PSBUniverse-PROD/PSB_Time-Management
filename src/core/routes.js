// Page addresses come from each module's index.js (the same definitions that
// create the pages), never typed into code. Safe in the proxy, server and browser.

/** The address of a module's page, by page name (or its first route). "" if not found. */
export function routePathOf(pageModule, pageName) {
  const routes = Array.isArray(pageModule?.routes) ? pageModule.routes : [];
  const route = pageName ? routes.find((r) => r?.page === pageName) : routes[0];
  return String(route?.path || "");
}

/** The short form of a /psbpages/... address ("/psbpages/login" → "/login"), same rule as scripts/generate-routes.js. */
export function shortPathOf(path) {
  const match = String(path || "").match(/^\/psbpages\/(.+)/);
  return match ? `/${match[1]}` : String(path || "");
}

/** The folder of an address ("/dealer/login" → "/dealer"). */
export function parentPathOf(path) {
  return String(path || "").replace(/\/[^/]+\/?$/, "") || "/";
}