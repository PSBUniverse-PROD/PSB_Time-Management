# 1. Make sure you're on main
git checkout main

# 2. Pull your latest pushed work from origin
git pull origin main

# 3. Update core-main from the shared core repo
git checkout core-main
git pull core main

# 4. Go back to main and merge core changes
git checkout main
git merge core-main -m "Merge upstream core changes into main"

# 5. If no conflicts, you're ready to work!

# PSBUniverse

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

Prerequisites:

- Node.js 20+ (Node 24 is confirmed working)
- npm 10+

Install dependencies:

```bash
npm install
```

Create your local environment file:

```bash
cp .env.example .env.local
```

Then set these values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, required for admin-only server workflows)

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Documentation

All documentation is in the `docs/` folder, organized by topic.

- [Docs Index](docs/README.md) — Full table of contents
- [Project Setup](docs/01-getting-started/setup.md) — Install and run locally
- [Architecture Overview](docs/02-architecture/overview.md) — Auth, RBAC, data flow
- [Module System](docs/02-architecture/module-system.md) — Build and register modules
- [Development Rules](docs/03-development-rules/rules.md) — Non-negotiable rules
- [Shared Components](docs/04-ui-system/shared-components.md) — UI specs and design tokens
- [CRUD Guide](docs/05-database/crud-guide.md) — Supabase query patterns
- [Junior Dev Quick Start](docs/08-junior-dev-guide/quickstart.md) — Build your first module

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
