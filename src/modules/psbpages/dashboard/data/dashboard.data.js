export function normalizeRoutePath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "#";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

// Picks an application's site address for the running environment
// (psb_s_application.dev_url / prod_url).
//   ""   → the app is served by this site (no URLs set), keep paths relative
//   null → the app lives elsewhere but has no URL for this environment
export function resolveAppBaseUrl(app, env) {
  const devUrl = String(app?.dev_url || "").trim();
  const prodUrl = String(app?.prod_url || "").trim();
  if (!devUrl && !prodUrl) return "";
  const baseUrl = env === "prod" ? prodUrl : env === "dev" ? devUrl : "";
  return baseUrl ? baseUrl.replace(/\/+$/, "") : null;
}

// Prefixes a card path with its application's site address. Full URLs and
// "#" are left alone; a null base makes the card non-clickable ("#").
export function applyAppBaseUrl(routePath, baseUrl) {
  if (routePath === "#" || routePath.startsWith("http://") || routePath.startsWith("https://")) return routePath;
  if (baseUrl === null) return "#";
  return `${baseUrl || ""}${routePath}`;
}
