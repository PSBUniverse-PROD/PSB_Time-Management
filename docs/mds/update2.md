# PSBUniverse-core — Branding: new PSBUniverse icon for the browser tab, portal header and login page

## Plan
Goal: replace the default Next.js tab icon and the two "Premium Steel Buildings" logo images with the new PSBUniverse galaxy-swirl icon.
Approach: add one SVG file and import it statically in the three places that show a logo. The tab icon is set through `metadata.icons` using the imported file's URL, so it is served from `/_next/static/...` and is not blocked by the auth proxy.
Order: Step 0 checks → create the SVG → layout (tab icon) → delete old favicon → portal header → login page + its CSS → test mock → verify.

## Context
- The tab icon is the stock Next.js `src/app/favicon.ico`; `src/app/layout.js:17-20` sets only `title` and `description`.
- The My Apps portal header shows the Premium Steel Buildings "PS" mark at 36px (`src/core/auth/DashboardModules.js:12` and `:171`).
- The login page shows the full "Premium Steel Buildings" wordmark logo (`src/modules/psbpages/login/pages/LoginView.jsx:9` and `:200`). The text "PSBUniverse" is already rendered as an `<h1>` on the next line, so only the image changes.
- Why not `src/app/icon.svg`: the auth proxy only lets `_next` paths and `/favicon.ico` through without a session (`src/proxy.js:27` and `:67`). A root `/icon.svg` would be redirected to `/login` for signed-out visitors. A statically imported file is served under `/_next/static/media/`, which the proxy already allows.
- `.portal-login-logo` is sized for a wide logo (`src/styles/globals.css:2321-2336`: `width: 100%; max-width: 92%`). A square icon needs a smaller size, added as a modifier class.
- `scripts/tests/sso-shell.tests.mjs:325` mocks the login view's logo import by its exact path, so it must follow the import change.

## Where to look
- `src/app/layout.js:1-20` — root layout imports and `metadata`.
- `src/app/favicon.ico` — default Next.js icon, tracked in git.
- `src/proxy.js:27`, `:67` — public-asset rule (read only; do not change).
- `src/core/auth/DashboardModules.js:6`, `:12`, `:171` — `next/image` import, logo import, logo render.
- `src/modules/psbpages/login/pages/LoginView.jsx:4`, `:9`, `:200` — same three for the login page.
- `src/styles/globals.css:496-501` — `.my-apps-portal-logo` (36×36, unchanged); `:2321-2336` — `.portal-login-logo`.
- `scripts/tests/sso-shell.tests.mjs:320-325` — `LoginView.jsx` module mocks.
- `src/styles/psb_logo.png`, `src/styles/psb_logo_notitle.png` — the current logo files (left in place).

## Scope
- May change:
  - `src/styles/psbuniverse_icon.svg` (new)
  - `src/app/layout.js`
  - `src/app/favicon.ico` (delete)
  - `src/core/auth/DashboardModules.js`
  - `src/modules/psbpages/login/pages/LoginView.jsx`
  - `src/styles/globals.css`
  - `scripts/tests/sso-shell.tests.mjs`
- Must NOT change: `src/proxy.js`, `next.config.mjs`, `src/styles/psb_logo.png`, `src/styles/psb_logo_notitle.png`, `public/images/**`, the header component, and the developer's uncommitted work — `package.json`, `package-lock.json`, `docs/mds/**`, `src/app/admin/dealer-master-setup/**`, `src/modules/admin/dealer-master-setup/**`.

## Step 0 — Read-only checks
Do not edit anything in this step.
- Confirm `src/styles/psbuniverse_icon.svg` and `src/app/icon.svg` do not exist. If either does, STOP and report.
- Confirm each `old_str` below appears exactly once in its file. If any is missing or appears more than once, STOP and report which one.
- Run `grep -rn "psb_logo" src scripts` and confirm the only matches are `src/core/auth/DashboardModules.js:12`, `src/modules/psbpages/login/pages/LoginView.jsx:9` and `scripts/tests/sso-shell.tests.mjs:325`. If there are others, STOP and report them.
- (Unverified) No file in `src/` imports an `.svg` today, so static SVG imports are untested in this repo. If the dev server or build fails on the `.svg` import in Steps 2, 4 or 5, STOP and report the exact error — do not add loaders or change `next.config.mjs`.

## Steps
If an `old_str` does not match, STOP and report it. Do not improvise or guess a fix.

### 1. Create `src/styles/psbuniverse_icon.svg`
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="PSBUniverse">
  <rect x="1" y="1" width="62" height="62" rx="13" fill="#ffffff" stroke="#c8d7e4" stroke-width="2"/>
  <path fill="#1d597f" d="M32 10A22 22 0 0 1 52.7 39.5A17 17 0 0 0 32 18A4 4 0 0 1 32 10Z"/>
  <path fill="#c4a06b" transform="rotate(120 32 32)" d="M32 10A22 22 0 0 1 52.7 39.5A17 17 0 0 0 32 18A4 4 0 0 1 32 10Z"/>
  <path fill="#2b7b89" transform="rotate(240 32 32)" d="M32 10A22 22 0 0 1 52.7 39.5A17 17 0 0 0 32 18A4 4 0 0 1 32 10Z"/>
  <circle cx="32" cy="32" r="6" fill="#1d597f"/>
</svg>
```

### 2. `src/app/layout.js` — import the icon
old_str:
```js
import Providers from "@/app/providers";
```
new_str:
```js
import Providers from "@/app/providers";
import psbIcon from "@/styles/psbuniverse_icon.svg";
```

### 3. Same file — set it as the tab icon
old_str:
```js
  title: "PSBUniverse",
  description: "PSBUniverse application workspace",
};
```
new_str:
```js
  title: "PSBUniverse",
  description: "PSBUniverse application workspace",
  icons: {
    icon: [{ url: psbIcon.src, type: "image/svg+xml" }],
  },
};
```

### 4. Delete `src/app/favicon.ico`
Delete the file (it is the default Next.js icon). While it exists, Next.js also emits a `/favicon.ico` link and browsers may keep showing it instead of the new icon.

### 5. `src/core/auth/DashboardModules.js` — portal header logo
old_str:
```js
import psbLogo from "@/styles/psb_logo_notitle.png";
```
new_str:
```js
import psbLogo from "@/styles/psbuniverse_icon.svg";
```

### 6. `src/modules/psbpages/login/pages/LoginView.jsx` — login logo import
old_str:
```jsx
import psbLogo from "@/styles/psb_logo.png";
```
new_str:
```jsx
import psbLogo from "@/styles/psbuniverse_icon.svg";
```

### 7. Same file — size the square icon
old_str:
```jsx
            <Image src={psbLogo} alt="PSBUniverse logo" className="portal-login-logo" priority />
```
new_str:
```jsx
            <Image src={psbLogo} alt="PSBUniverse logo" className="portal-login-logo portal-login-logo--mark" priority />
```

### 8. `src/styles/globals.css` — modifier class for the square icon
old_str:
```css
  object-fit: contain;
  border: none;
  border-radius: 0;
  padding: 0;
  filter: none;
}
```
new_str:
```css
  object-fit: contain;
  border: none;
  border-radius: 0;
  padding: 0;
  filter: none;
}

/* Square icon mark: the base rule is sized for a wide wordmark logo. */
.portal-login-logo.portal-login-logo--mark {
  width: clamp(96px, 11vw, 132px);
  max-width: 132px;
}
```

### 9. `scripts/tests/sso-shell.tests.mjs` — follow the import path in the mock
old_str:
```js
    "@/styles/psb_logo.png": defaultExport("logo"),
```
new_str:
```js
    "@/styles/psbuniverse_icon.svg": defaultExport("logo"),
```

## Verify
- Lint: `npm run lint` → 0 errors; warnings no higher than before the change.
- Build: `npm run build` → 0 errors.
- Tests: `node --test scripts/tests/sso-shell.tests.mjs` → same pass/fail counts as before the change (run it once before Step 1 to get the baseline).
- Grep:
  - `grep -rn "psb_logo" src scripts` → no matches.
  - `grep -rn "psbuniverse_icon.svg" src scripts` → exactly four: `src/app/layout.js`, `src/core/auth/DashboardModules.js`, `src/modules/psbpages/login/pages/LoginView.jsx`, `scripts/tests/sso-shell.tests.mjs`.
  - `ls src/app/favicon.ico` → file not found.
  - `git status --short` → the seven files in Scope, plus the developer's existing uncommitted items unchanged.
- Manual (no DB/data changes):
  1. `npm run dev`, open `/login` in a private window (signed out) → the browser tab shows the white tile with the navy, gold and teal swirl. Hard-refresh (Ctrl+F5) if the old icon is cached.
  2. On the same page, view source and find `<link rel="icon"` → its `href` starts with `/_next/static/media/psbuniverse_icon` and ends with `.svg`; opening that URL shows the icon, not the login page.
  3. The login page's left panel shows the swirl icon roughly 100–130px wide, centred above "PSBUniverse", not stretched across the panel.
  4. Sign in and open the dashboard → the swirl icon appears at 36px beside "PSBUniverse Portal".
  5. Open any admin page → the tab icon is still the swirl.

## Report back
- Step 0 findings
- Lint, build and test summaries (with the test baseline)
- Any `old_str` that did not match (step number + file)
- Result of each manual check, especially 1 and 2