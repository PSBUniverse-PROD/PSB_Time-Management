#!/usr/bin/env node

/**
 * generate-routes.js
 *
 * Scans every module index.js under src/modules/, reads route definitions,
 * and auto-generates thin page.js wrappers inside src/app/.
 *
 * Developers NEVER touch src/app/ — this script does it for them.
 *
 * SSO INTEGRATION:
 *   - Routes can specify `auth: true` (default) or `auth: false` for public pages
 *   - Public routes (auth: false) skip authentication checks
 *   - Generated metadata can be consumed by middleware or layout components
 *
 * Usage:
 *   node scripts/generate-routes.js                 — regenerate all route wrappers
 *   npm run gen:routes                              — same thing via npm script
 *   (also runs automatically on npm run dev / npm run build)
 *
 * Add a new page to an existing module (newpage subcommand):
 *   node scripts/generate-routes.js newpage <module-index> <page-slug>
 *   npm run new-page -- <module-index> <page-slug>
 *
 *   The slug can include a subfolder to organize page files under the module's
 *   pages/ directory. Route path is derived from the module's directory location
 *   under src/modules/ (NOT from existing routes):
 *
 *     # Flat — creates src/modules/admin/gutter/pages/SettingsPage.js + .../SettingsView.jsx
 *     npm run new-page -- modules/admin/gutter/index.js settings
 *     # Route: /admin/gutter/settings
 *
 *     # Subfolder — creates src/modules/examples/pages/orders/CreatePage.js + .../CreateView.jsx
 *     npm run new-page -- modules/examples/index.js orders/create
 *     # Route: /examples/orders/create
 *
 *   This will:
 *     1. Create pages/<PageSlug>Page.js   (server component)
 *     2. Create pages/<PageSlug>View.jsx  (client component)
 *     3. Add the route entry to the module's index.js
 *     4. Run route generation to create the src/app/ wrapper
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(process.cwd());
const MODULES_DIR = path.join(ROOT, "src", "modules");
const APP_DIR = path.join(ROOT, "src", "app");

const GENERATED_MARKER = "// @generated — do not edit. Run `npm run gen:routes` to regenerate.";

// ---------------------------------------------------------------------------
// 1. Discover all module index.js files (recursive scan)
// ---------------------------------------------------------------------------

function findModuleIndexFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(dir, entry.name, "index.js");
    if (fs.existsSync(indexPath)) {
      results.push(indexPath);
    } else {
      // Check sub-directories (e.g. admin/, psbpages/)
      results.push(...findModuleIndexFiles(path.join(dir, entry.name)));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Load module definition from index.js
// ---------------------------------------------------------------------------

async function loadModuleDefinition(indexPath) {
  const url = pathToFileURL(indexPath);
  url.searchParams.set("t", String(Date.now()));
  const mod = await import(url.href);
  return mod.default ?? mod;
}

// ---------------------------------------------------------------------------
// 3. Resolve the import path for the page component
// ---------------------------------------------------------------------------

function resolveImportAlias(indexPath, pageName) {
  // indexPath:  .../src/modules/admin/status-setup/index.js
  // We need:    @/modules/admin/status-setup/pages/StatusSetupPage
  const moduleDir = path.dirname(indexPath);
  const relFromSrc = path.relative(path.join(ROOT, "src"), moduleDir).replace(/\\/g, "/");
  return `@/${relFromSrc}/pages/${pageName}`;
}

// ---------------------------------------------------------------------------
// 4. Generate the thin page.js content
// ---------------------------------------------------------------------------

function generatePageContent(importPath, componentName, route) {
  const lines = [
    GENERATED_MARKER,
    `import ${componentName} from "${importPath}";`,
    "",
    `export const dynamic = "force-dynamic";`,
    "",
  ];

  // SSO auth metadata — consumed by middleware or layout components
  // Routes with auth: false are public (e.g. login, error pages)
  const requiresAuth = route.auth !== false;
  lines.push(`export const routeMeta = ${JSON.stringify({ auth: requiresAuth, path: route.path })};`);
  lines.push("");

  lines.push("export default function Page(props) {");
  lines.push(`  return <${componentName} {...props} />;`);
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 5. Write file only if content changed
// ---------------------------------------------------------------------------

function writeIfChanged(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    // Only overwrite auto-generated files
    if (!existing.startsWith(GENERATED_MARKER)) {
      console.log(`  SKIP (manual) ${path.relative(ROOT, filePath)}`);
      return false;
    }
    if (existing === content) return false;
  }
  fs.writeFileSync(filePath, content, "utf-8");
  return true;
}

// ---------------------------------------------------------------------------
// 6. Clean up stale generated route files
// ---------------------------------------------------------------------------

function cleanStaleRoutes(generatedPaths) {
  const generatedSet = new Set(generatedPaths.map((p) => path.resolve(p)));

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "page.js" && !generatedSet.has(path.resolve(full))) {
        // Check if it's a generated file we should clean up
        try {
          const content = fs.readFileSync(full, "utf-8");
          if (content.startsWith(GENERATED_MARKER)) {
            fs.unlinkSync(full);
            // Remove empty parent dirs
            let parent = path.dirname(full);
            while (parent !== APP_DIR) {
              const items = fs.readdirSync(parent);
              if (items.length === 0) {
                fs.rmdirSync(parent);
                parent = path.dirname(parent);
              } else {
                break;
              }
            }
            console.log(`  REMOVED stale ${path.relative(ROOT, full)}`);
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Only walk known module route dirs (admin/, psbpages/), not root app files
  walk(path.join(APP_DIR, "admin"));
  walk(path.join(APP_DIR, "psbpages"));
}

// ---------------------------------------------------------------------------
// 7. Generate rewrites.json for next.config.mjs
//    Any psbpages/ module gets a clean URL rewrite:
//      /dashboard      → /psbpages/dashboard
//      /dashboard/:p*  → /psbpages/dashboard/:p*
// ---------------------------------------------------------------------------

function generateRewrites(moduleDefinitions) {
  const rewrites = [];

  for (const { definition } of moduleDefinitions) {
    if (!definition?.routes || !Array.isArray(definition.routes)) continue;

    for (const route of definition.routes) {
      if (!route.path) continue;

      // Only psbpages/ routes need rewrites (admin/ URLs are already clean)
      const match = route.path.match(/^\/psbpages\/(.+)/);
      if (!match) continue;

      const cleanPath = `/${match[1]}`;

      // Exact path
      rewrites.push({ source: cleanPath, destination: route.path });

      // Wildcard sub-paths (skip if path already has a deeper structure like /examples/data-table)
      const segments = match[1].split("/").filter(Boolean);
      if (segments.length === 1) {
        rewrites.push({
          source: `${cleanPath}/:path*`,
          destination: `${route.path}/:path*`,
        });
      }
    }
  }

  // Deduplicate by source
  const seen = new Set();
  return rewrites.filter((r) => {
    if (seen.has(r.source)) return false;
    seen.add(r.source);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 8. Subcommand: newpage — scaffold a new page for an existing module
//     Usage:  node scripts/generate-routes.js newpage <module-index> <page-slug>
//
//     The slug may include a subfolder for organizing page files:
//       node scripts/generate-routes.js newpage modules/admin/gutter/index.js orders/create
//       → creates src/modules/admin/gutter/pages/orders/CreatePage.js + .../CreateView.jsx
//       → route: /admin/gutter/orders/create
//
//     Route path is derived from the module's directory under src/modules/,
//     NOT from existing routes (e.g. modules/psbpages/examples/ → /psbpages/examples).
//
//     Examples:
//       node scripts/generate-routes.js newpage modules/admin/gutter/index.js settings
//       npm run gen:routes -- newpage modules/admin/gutter/index.js settings
// ---------------------------------------------------------------------------

function toPascalCase(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

async function handleNewPage(args) {
  const moduleIndexRel = args[0];
  const pageSlug = args[1];

  if (!moduleIndexRel || !pageSlug) {
    console.error(`
  Usage:  node scripts/generate-routes.js newpage <module-index> <page-slug>

  The slug can include a subfolder path for organizing pages:
    npm run gen:routes -- newpage modules/admin/gutter/index.js settings
    npm run gen:routes -- newpage modules/admin/gutter/index.js orders/create

  Examples:
    # Flat — creates src/modules/admin/gutter/pages/SettingsPage.js + .../SettingsView.jsx
    npm run gen:routes -- newpage modules/admin/gutter/index.js settings

    # Subfolder — creates src/modules/admin/gutter/pages/orders/CreatePage.js + .../CreateView.jsx
    npm run gen:routes -- newpage modules/admin/gutter/index.js orders/create

  Route path is derived from the module's directory under src/modules/.
  e.g. modules/psbpages/examples/ → /psbpages/examples.

  This will:
    1. Create pages/<page files>  (server + client component)
    2. Add the route to your module's index.js
    3. Run route generation to create the app wrapper
    `);
    process.exit(1);
  }

  // Resolve the module index path
  const indexPath = path.resolve(ROOT, "src", moduleIndexRel);
  if (!fs.existsSync(indexPath)) {
    console.error(`  ERROR: Module index not found: ${indexPath}`);
    console.error(`  Make sure the path is relative to src/, e.g. modules/admin/gutter/index.js`);
    process.exit(1);
  }

  // Load the existing module definition to find the base route
  let definition;
  try {
    definition = await loadModuleDefinition(indexPath);
  } catch (err) {
    console.error(`  ERROR loading module: ${err.message}`);
    process.exit(1);
  }

  if (!definition?.routes?.length) {
    console.error(`  ERROR: Module has no routes defined. Add at least one route first.`);
    process.exit(1);
  }

  // Parse pageSlug for subfolder support
  // "orders/create"  → subfolder="orders",    baseSlug="create"
  // "test-page"      → subfolder=null,        baseSlug="test-page"
  const slugParts = pageSlug.replace(/^\/+/, "").split("/").filter(Boolean);
  const subfolder = slugParts.length > 1 ? slugParts.slice(0, -1).join("/") : null;
  const baseSlug = slugParts[slugParts.length - 1];

  // Derive names
  const pascal = toPascalCase(baseSlug);
  const pageName = subfolder ? `${subfolder}/${pascal}Page` : `${pascal}Page`;
  const viewName = subfolder ? `${subfolder}/${pascal}View` : `${pascal}View`;
  const pageFilename = `${pascal}Page.js`;
  const viewFilename = `${pascal}View.jsx`;

  const moduleDir = path.dirname(indexPath);
  const pagesDir = subfolder
    ? path.join(moduleDir, "pages", subfolder)
    : path.join(moduleDir, "pages");

  // Derive the new route path from the module directory location
  // e.g. src/modules/psbpages/examples/ → /psbpages/examples
  const relFromModules = path.relative(MODULES_DIR, moduleDir).replace(/\\/g, "/");
  const baseRoute = `/${relFromModules}`;
  const newRoutePath = `${baseRoute}/${pageSlug}`;

  // Check if route already exists
  const existingRoute = definition.routes.find((r) => r.path === newRoutePath);
  if (existingRoute) {
    console.error(`  ERROR: Route "${newRoutePath}" already exists in this module.`);
    process.exit(1);
  }

  // Check if page files already exist
  const pageFile = path.join(pagesDir, pageFilename);
  const viewFile = path.join(pagesDir, viewFilename);

  if (fs.existsSync(pageFile)) {
    console.error(`  ERROR: ${path.relative(ROOT, pageFile)} already exists.`);
    process.exit(1);
  }
  if (fs.existsSync(viewFile)) {
    console.error(`  ERROR: ${path.relative(ROOT, viewFile)} already exists.`);
    process.exit(1);
  }

  // ── Create page files ───────────────────────────────────

  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });

  const pageContent = `\
/**
 * Server Component — ${pascal}Page.js
 *
 * Runs on the server. Loads data, then passes it to the View.
 *
 * RULES:
 *   - No useState, useEffect, or onClick here — those go in the View.
 *   - Do NOT wrap JSX in try/catch (causes a React lint error).
 */
import ${pascal}View from "./${pascal}View";

export const dynamic = "force-dynamic";

export default async function ${pascal}Page() {
  return <${pascal}View />;
}
`;

  const viewContent = `\
/**
 * Client Component — ${pascal}View.jsx
 *
 * Runs in the browser. All UI, hooks, and interaction go here.
 */
"use client";

export default function ${pascal}View() {
  return (
    <main className="container py-4">
      <h2>${baseSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</h2>
      <p className="text-muted">This page is ready for development.</p>
    </main>
  );
}
`;

  fs.writeFileSync(pageFile, pageContent, "utf-8");
  console.log(`  CREATE  ${path.relative(ROOT, pageFile)}`);

  fs.writeFileSync(viewFile, viewContent, "utf-8");
  console.log(`  CREATE  ${path.relative(ROOT, viewFile)}`);

  // ── Add route to index.js ──────────────────────────────

  const indexSource = fs.readFileSync(indexPath, "utf-8");
  const newRouteEntry = `    { path: "${newRoutePath}", page: "${pageName}" },`;

  // Find the last route entry line and insert after it
  const routeLineRegex = /^(\s*\{[^}]*path:\s*"[^"]*"[^}]*page:\s*"[^"]*"[^}]*\},?\s*)$/gm;
  let lastRouteMatch = null;
  let match;
  while ((match = routeLineRegex.exec(indexSource)) !== null) {
    lastRouteMatch = match;
  }

  if (!lastRouteMatch) {
    console.error(`  ERROR: Could not find existing route entries in index.js to insert after.`);
    console.error(`  Please add the route manually:`);
    console.error(`    ${newRouteEntry}`);
    process.exit(1);
  }

  const insertPos = lastRouteMatch.index + lastRouteMatch[0].length;
  const updatedSource =
    indexSource.slice(0, insertPos) +
    "\n" + newRouteEntry +
    indexSource.slice(insertPos);

  fs.writeFileSync(indexPath, updatedSource, "utf-8");
  console.log(`  UPDATE  ${path.relative(ROOT, indexPath)}`);
  console.log(`          Added route: ${newRoutePath} → ${pageName}\n`);

  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Check for subcommand
  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args[0] === "newpage") {
    await handleNewPage(args.slice(1));
    // Fall through to normal route generation
  }

  console.log("Generating route files...\n");

  const indexFiles = findModuleIndexFiles(MODULES_DIR);
  const generatedPaths = [];
  const moduleDefinitions = [];
  let created = 0;
  let unchanged = 0;

  for (const indexPath of indexFiles) {
    let definition;
    try {
      definition = await loadModuleDefinition(indexPath);
    } catch (err) {
      console.log(`  ERROR loading ${path.relative(ROOT, indexPath)}: ${err.message}`);
      continue;
    }

    moduleDefinitions.push({ indexPath, definition });

    if (!definition?.routes || !Array.isArray(definition.routes)) continue;

    for (const route of definition.routes) {
      if (!route.path || !route.page) continue;

      // route.path = "/admin/status-setup" → app dir = src/app/admin/status-setup/page.js
      const routeDir = path.join(APP_DIR, ...route.path.split("/").filter(Boolean));
      const pageFile = path.join(routeDir, "page.js");

      // Component name from page filename (e.g. "data-table/DataTablePage" → "DataTablePage")
      const pageName = route.page.split("/").pop();
      const importPath = resolveImportAlias(indexPath, route.page);
      const content = generatePageContent(importPath, pageName, route);

      generatedPaths.push(pageFile);

      if (writeIfChanged(pageFile, content)) {
        console.log(`  WRITE ${path.relative(ROOT, pageFile)}`);
        created++;
      } else {
        unchanged++;
      }
    }
  }

  cleanStaleRoutes(generatedPaths);

  // Generate rewrites.json for next.config.mjs
  const rewrites = generateRewrites(moduleDefinitions);
  const rewritesPath = path.join(APP_DIR, "rewrites.json");
  const rewritesContent = JSON.stringify(rewrites, null, 2) + "\n";
  if (writeIfChanged(rewritesPath, rewritesContent)) {
    console.log(`  WRITE ${path.relative(ROOT, rewritesPath)}`);
  }

  console.log(`\nDone. ${created} written, ${unchanged} unchanged.\n`);
}

main().catch((err) => {
  console.error("Route generation failed:", err);
  process.exit(1);
});
