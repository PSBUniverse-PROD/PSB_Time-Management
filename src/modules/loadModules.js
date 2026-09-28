import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getSupabaseAdmin } from "@/core/supabase/admin";

async function readModuleEntries(modulesDir) {
  try {
    return await fs.readdir(modulesDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function resolveModulePath(modulesDir, moduleName) {
  const modulePath = path.join(modulesDir, moduleName, "index.js");

  try {
    await fs.access(modulePath);
    return modulePath;
  } catch {
    return null;
  }
}

function createModuleUrl(modulePath) {
  const moduleUrl = pathToFileURL(modulePath);

  // Raw file URL imports are cached by Node. Bust cache in dev so module edits appear immediately.
  if (process.env.NODE_ENV !== "production") {
    moduleUrl.searchParams.set("t", String(Date.now()));
  }

  return moduleUrl;
}

function createPageImporter(modulePath) {
  const moduleDir = path.dirname(modulePath);

  return async function importPage(pageName) {
    const pagePath = path.join(moduleDir, "pages", `${pageName}.js`);

    try {
      await fs.access(pagePath);
    } catch {
      return null;
    }

    const pageUrl = createModuleUrl(pagePath);
    return import(/* webpackIgnore: true */ pageUrl.href);
  };
}

export async function loadModules() {
  const modules = [];
  const seenModuleKeys = new Set();
  const modulesDir = path.join(process.cwd(), "src", "modules");
  const entries = await readModuleEntries(modulesDir);

  async function scanDirectory(dir, dirEntries) {
    for (const entry of dirEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const modulePath = await resolveModulePath(dir, entry.name);

      if (!modulePath) {
        // Check if the directory contains sub-modules (e.g. admin/)
        const subDir = path.join(dir, entry.name);
        const subEntries = await readModuleEntries(subDir);
        if (subEntries.length > 0) {
          await scanDirectory(subDir, subEntries);
        }
        continue;
      }

      const moduleUrl = createModuleUrl(modulePath);
      const importedModule = await import(/* webpackIgnore: true */ moduleUrl.href);
      const moduleDefinition = importedModule.default ?? importedModule;
      const moduleKey = String(moduleDefinition?.key || entry.name);

      if (seenModuleKeys.has(moduleKey)) {
        continue;
      }

      moduleDefinition._importPage = createPageImporter(modulePath);

      seenModuleKeys.add(moduleKey);
      modules.push(moduleDefinition);
    }
  }

  await scanDirectory(modulesDir, entries);

  await resolveAppIds(modules);

  return modules;
}

async function resolveAppIds(modules) {
  const moduleKeysNeeded = new Set();

  for (const mod of modules) {
    const mk = mod.module_key;
    if (mk) {
      moduleKeysNeeded.add(String(mk));
    }
  }

  if (moduleKeysNeeded.size === 0) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_application")
    .select("app_id, module_key")
    .in("module_key", Array.from(moduleKeysNeeded))
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to resolve app_id from psb_s_application: ${error.message}`);
  }

  const keyToAppId = new Map();
  for (const row of data || []) {
    keyToAppId.set(row.module_key, row.app_id);
  }

  const missing = [];
  for (const mod of modules) {
    const mk = String(mod.module_key || "");
    if (!mk) continue;

    const appId = keyToAppId.get(mk);
    if (appId == null) {
      missing.push(`${mod.key} (module_key: "${mk}")`);
    } else {
      mod.app_id = appId;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Modules missing from psb_s_application (no active row with matching module_key):\n  - ${missing.join("\n  - ")}`
    );
  }
}

export async function resolveAppId(moduleKey) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("psb_s_application")
    .select("app_id")
    .eq("module_key", moduleKey)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error(`No active application found for module_key "${moduleKey}"`);
  }

  return data.app_id;
}
