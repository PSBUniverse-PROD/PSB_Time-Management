"use server";

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Chapter / section manifest.
 * Each chapter maps to a folder under docs/, and sections map to .md files.
 */
const BOOK_MANIFEST = [
  {
    id: "development-rules",
    title: "Development Rules",
    icon: "shield-halved",
    sections: [
      { id: "rules", file: "03-development-rules/rules.md", title: "Development Rules" },
    ],
  },
  {
    id: "getting-started",
    title: "Getting Started",
    icon: "rocket",
    sections: [
      { id: "getting-started-v2", file: "01-getting-started/getting-started-v2.md", title: "Getting Started (v2)" },
      { id: "creating-new-project", file: "01-getting-started/creating-a-new-project.md", title: "Creating a New Project" },
      { id: "getting-started-legacy", file: "01-getting-started/getting-started.md", title: "Getting Started (Legacy)" },
    ],
  },
  {
    id: "architecture",
    title: "Architecture",
    icon: "sitemap",
    sections: [
      { id: "overview", file: "02-architecture/overview.md", title: "Architecture Overview" },
      { id: "module-system", file: "02-architecture/module-system.md", title: "Module System" },
    ],
  },
  {
    id: "ui-system",
    title: "UI System",
    icon: "palette",
    sections: [
      { id: "shared-components", file: "04-ui-system/shared-components.md", title: "Shared Components" },
    ],
  },
  {
    id: "database",
    title: "Database",
    icon: "database",
    sections: [
      { id: "naming-conventions", file: "05-database/naming-conventions.md", title: "Naming Conventions" },
      { id: "crud-guide", file: "05-database/crud-guide.md", title: "CRUD Guide" },
      { id: "crud-example", file: "05-database/crud-example.md", title: "CRUD Example" },
    ],
  },
  {
    id: "batch-edit",
    title: "Batch Edit",
    icon: "pen",
    sections: [
      { id: "blueprint", file: "06-batch-edit/blueprint.md", title: "Implementation Blueprint" },
      { id: "table-batch-modes", file: "06-batch-edit/table-batch-modes.md", title: "Table Batch Modes" },
    ],
  },
  {
    id: "auto-routing",
    title: "Auto-Route Generation",
    icon: "signs-post",
    sections: [
      { id: "auto-routing", file: "07-proposals/auto-module-routing.md", title: "Auto-Route Generation" },
    ],
  },
  {
    id: "junior-dev-guide",
    title: "Junior Dev Guide",
    icon: "graduation-cap",
    sections: [
      { id: "quickstart", file: "08-junior-dev-guide/quickstart.md", title: "Quick Start" },
      { id: "module-creation-checklist", file: "08-junior-dev-guide/module-creation-checklist.md", title: "Module Creation Checklist" },
      { id: "full-guide", file: "08-junior-dev-guide/full-guide.md", title: "Full Guide" },
    ],
  },
  {
    id: "changelog",
    title: "Changelog",
    icon: "clock-rotate-left",
    sections: [
      { id: "changelog", file: "CHANGELOG.md", title: "Release History" },
    ],
  },
];

async function readDocFile(filePath) {
  const docsDir = path.join(process.cwd(), "docs");
  const fullPath = path.join(docsDir, filePath);
  try {
    return await fs.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function loadBookManifest() {
  return BOOK_MANIFEST.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    icon: chapter.icon,
    sections: chapter.sections.map((s) => ({ id: s.id, title: s.title })),
  }));
}

export async function loadSection(sectionId) {
  for (const chapter of BOOK_MANIFEST) {
    const section = chapter.sections.find((s) => s.id === sectionId);
    if (section) {
      const content = await readDocFile(section.file);
      return {
        id: section.id,
        title: section.title,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        content: content || `> Section "${section.title}" could not be loaded.`,
      };
    }
  }
  return null;
}
