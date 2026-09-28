# PSBUniverse Documentation

Organized reference for the PSBUniverse Core platform. Start at the top and work your way down.

---

## Quick Navigation

- New developer working in an existing app repo: [Getting Started (v2)](01-getting-started/getting-started-v2.md)
- Senior dev creating a brand-new app repo from core: [Creating a New Project](01-getting-started/creating-a-new-project.md)
- Junior dev building first feature module: [Quick Start](08-junior-dev-guide/quickstart.md)
- Full team rules and standards: [Full Guide](08-junior-dev-guide/full-guide.md)

---

## 1. Getting Started

- [Getting Started](01-getting-started/getting-started-v2.md) — Install, configure, and run the project locally
- [Creating a New Project](01-getting-started/creating-a-new-project.md) — Senior workflow to create a new app repo from core

## 2. Architecture

- [Architecture Overview](02-architecture/overview.md) — Auth, RBAC, key files, data flow, troubleshooting
- [Module System](02-architecture/module-system.md) — Module contract, routing, auto-discovery, auth integration

## 3. Development Rules

- [Development Rules](03-development-rules/rules.md) — Non-negotiable rules for UI, modules, RBAC, and tables

## 4. UI System

- [Shared Components](04-ui-system/shared-components.md) — Component specs, design tokens, table behavior, styling rules
- Live reference: `/psbpages/examples` (dev server) — Shared UI guide, playground, and component reference
- Data table example: `/psbpages/examples/data-table` (dev server)

## 5. Database

- [Naming Conventions](05-database/naming-conventions.md) — Table, column, constraint, and index naming standards
- [CRUD Guide](05-database/crud-guide.md) — Supabase query patterns, error handling, safety rules
- [CRUD Example](05-database/crud-example.md) — Roles module CRUD: Server Actions, Page, View (full working example)

## 6. Batch Edit

- [Implementation Blueprint](06-batch-edit/blueprint.md) — Draft+Baseline+Diff pattern, save models, edge cases
- [Table Batch Modes](06-batch-edit/table-batch-modes.md) — TableZ modes, action logic, row behavior rules

## 7. Proposals

- [Auto Module Routing](07-proposals/auto-module-routing.md) — Implemented: auto-discovery replaces hardcoded pageImporters

## 8. Developer Guide

- [Quick Start](08-junior-dev-guide/quickstart.md) — Build your first module (walkthrough)
- [Full Guide](08-junior-dev-guide/full-guide.md) — Complete rulebook: permissions, RBAC, database, UI, PR checklist

> Both guides reference the [Getting Started Guide](01-getting-started/getting-started-v2.md) for GitHub, environment, and dependency setup.

## Reference

- [Changelog](CHANGELOG.md) — Release history and behavior changes
