// sync-core-deps.mjs - Adds npm dependencies that core's package.json has
// and this repo's package.json is missing.
// Usage: node scripts/sync-core-deps.mjs   (run from the project root)
//
// Reads core's list from the fetched core remote (core/main:package.json).
// Add-only: never changes a version this repo already declares and never
// removes a package, so app-specific dependencies are left alone.
//
// Exit codes: 0 = nothing to add, 10 = package.json updated (run npm install),
//             1 = error.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const PACKAGE_PATH = "package.json";
const SECTIONS = ["dependencies", "devDependencies"];

let corePackage;
try {
  corePackage = JSON.parse(
    execFileSync("git", ["show", "core/main:package.json"], { encoding: "utf8" }),
  );
} catch (error) {
  console.error("  Could not read core/main:package.json - is the core remote fetched?");
  console.error(`  ${error.message}`);
  process.exit(1);
}

const raw = readFileSync(PACKAGE_PATH, "utf8").replace(/^\uFEFF/, "");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const localPackage = JSON.parse(raw);

const declared = new Set(SECTIONS.flatMap((section) => Object.keys(localPackage[section] || {})));
const added = [];

for (const section of SECTIONS) {
  for (const [name, range] of Object.entries(corePackage[section] || {})) {
    if (declared.has(name)) continue;
    localPackage[section] = { ...(localPackage[section] || {}), [name]: range };
    added.push(`${name}@${range} (${section})`);
  }
  if (localPackage[section]) {
    localPackage[section] = Object.fromEntries(
      Object.entries(localPackage[section]).sort(([a], [b]) => a.localeCompare(b, "en")),
    );
  }
}

if (added.length === 0) {
  console.log("  Core dependencies OK.");
  process.exit(0);
}

writeFileSync(PACKAGE_PATH, JSON.stringify(localPackage, null, 2).replace(/\n/g, eol) + eol);
console.log("  Added dependencies required by core:");
for (const entry of added) console.log(`    + ${entry}`);
process.exit(10);
