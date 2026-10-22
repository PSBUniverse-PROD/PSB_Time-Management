export function normalizeRoutePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

// This deployment's own application (empty in core itself).
const OWN_MODULE_KEY = String(process.env.NEXT_PUBLIC_MODULE_KEY || "").trim().toLowerCase();

// Picks an application's site address for the running environment
// (psb_s_application.dev_url / prod_url): prod uses prod_url; dev and local
// both use dev_url, so a locally run portal opens the dev copy of other apps.
// Exception: run locally, a module app's OWN application (module_key equal to
// NEXT_PUBLIC_MODULE_KEY) stays on this site, e.g. localhost:3000/time-tracker.
//   ""   → the app is served by this site, keep paths relative
//   null → the app lives elsewhere but has no URL for this environment
export function resolveAppBaseUrl(app, env) {
  const devUrl = String(app?.dev_url || "").trim();
  const prodUrl = String(app?.prod_url || "").trim();
  if (!devUrl && !prodUrl) return "";
  const moduleKey = String(app?.module_key || "").trim().toLowerCase();
  if (env === "local" && OWN_MODULE_KEY && moduleKey === OWN_MODULE_KEY) return "";
  const baseUrl = env === "prod" ? prodUrl : devUrl;
  return baseUrl ? baseUrl.replace(/\/+$/, "") : null;
}

// Prefixes a card path with its application's site address. Full URLs and
// "#" are left alone; a null base makes the card non-clickable ("#").
export function applyAppBaseUrl(routePath, baseUrl) {
  if (routePath === "#" || routePath.startsWith("http://") || routePath.startsWith("https://")) return routePath;
  if (baseUrl === null) return "#";
  return `${baseUrl || ""}${routePath}`;
}

const MODULE_ROUTE_PREFIX = "module:";

// Turns a card's stored Launch URL into the link the dashboard renders.
//   "module:<module_key>/<path>" → that application's site address for this
//     environment + the path. An unknown key, or an app with no address for
//     this environment, gives "#" (card shown but not clickable).
//   anything else → the normal path rules, prefixed with the address of the
//     application the card is filed under (when it has one).
export function resolveCardRoutePath(value, ownAppBaseUrl, baseUrlByModuleKey) {
  const raw = String(value || "").trim();
  if (!raw.toLowerCase().startsWith(MODULE_ROUTE_PREFIX)) {
    return applyAppBaseUrl(normalizeRoutePath(raw), ownAppBaseUrl);
  }

  const target = raw.slice(MODULE_ROUTE_PREFIX.length).trim();
  const slashIndex = target.indexOf("/");
  const moduleKey = (slashIndex === -1 ? target : target.slice(0, slashIndex)).trim().toLowerCase();
  const pathname = slashIndex === -1 ? "/" : target.slice(slashIndex);
  const baseUrl = baseUrlByModuleKey?.get(moduleKey);
  if (baseUrl === undefined || baseUrl === null) return "#";
  return `${baseUrl}${pathname}`;
}
