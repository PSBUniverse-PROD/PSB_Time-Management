"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import Form from "react-bootstrap/Form";
const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";
const DALLAS_TIME_ZONE = "America/Chicago";

function getDallasHour() {
  try {
    const hourText = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: DALLAS_TIME_ZONE,
    }).format(new Date());

    const hour = Number(hourText);
    return Number.isFinite(hour) ? hour : new Date().getHours();
  } catch {
    return new Date().getHours();
  }
}

function getTimeGreeting() {
  const hour = getDallasHour();

  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function normalizePath(value) {
  return String(value || "/").toLowerCase();
}

function isMyPsbPath(pathname) {
  const path = normalizePath(pathname);
  return path === "/profile" || path.startsWith("/profile/") || path === "/company";
}

function isConfigurationPath(pathname) {
  const path = normalizePath(pathname);
  return path.startsWith("/setup");
}

function isMyAppsPath(pathname) {
  if (isMyPsbPath(pathname)) {
    return false;
  }

  if (isConfigurationPath(pathname)) {
    return true;
  }

  const path = normalizePath(pathname);
  return (
    path === "/" ||
    path === "/dashboard" ||
    path.startsWith("/dashboard/")
  );
}

function isExamplesPath(pathname) {
  const path = normalizePath(pathname);
  return path === "/examples" || path.startsWith("/examples/");
}

function isDocsPath(pathname) {
  const path = normalizePath(pathname);
  return path === "/psbpages/documentation" || path.startsWith("/psbpages/documentation/");
}

function normalizeAccessToken(value) {
  return String(value || "").trim().toUpperCase();
}

function hasExampleNavAccess(roles) {
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }

  return roles.some((mapping) => {
    if (!mapping) {
      return false;
    }

    const appToken =
      normalizeAccessToken(mapping.app_name) ||
      normalizeAccessToken(mapping.app_code) ||
      normalizeAccessToken(mapping.app_key) ||
      normalizeAccessToken(mapping.app_id);
    const roleToken =
      normalizeAccessToken(mapping.role_name) ||
      normalizeAccessToken(mapping.role_code) ||
      normalizeAccessToken(mapping.role_key) ||
      normalizeAccessToken(mapping.role_id);

    return appToken === "PSBUNIVERSE" && roleToken === "MASTER";
  });
}

export default function Header({
  user,
  roles = [],
  pathname = "/",
  onLogout,
  logoutBusy = false,
  onNavigateStart,
  loaderProgress = 0,
  loaderVisible = false,
}) {
  const [greeting, setGreeting] = useState(() => getTimeGreeting());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setGreeting(getTimeGreeting());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const displayName = useMemo(() => {
    const firstName = String(user?.first_name || "").trim();
    if (firstName) return firstName;
    return user?.username || user?.email || "User";
  }, [user]);

  const canSeeExamples = useMemo(() => hasExampleNavAccess(roles), [roles]);

  const tabs = useMemo(() => {
    // These tabs represent the main PSBUniverse hub, so they always link back to
    // the canonical core portal (NEXT_PUBLIC_CORE_PORTAL_URL). Building absolute
    // URLs means that clicking them from a module subdomain (e.g.
    // map.psbuniverse.com) performs a real browser navigation back to the root
    // domain instead of keeping the user on the current subdomain.
    const nextTabs = [
      {
        key: "my-psb",
        label: "My PSB",
        href: `${CORE_PORTAL_URL}/profile`,
        active: isMyPsbPath(pathname),
      },
      {
        key: "my-apps",
        label: "My Apps",
        href: `${CORE_PORTAL_URL}/dashboard`,
        active: isMyAppsPath(pathname),
      },
    ];

    if (canSeeExamples) {
      nextTabs.push({
        key: "example",
        label: "Example",
        href: `${CORE_PORTAL_URL}/examples`,
        active: isExamplesPath(pathname),
      });

      nextTabs.push({
        key: "docs",
        label: "Docs",
        href: `${CORE_PORTAL_URL}/psbpages/documentation`,
        active: isDocsPath(pathname),
      });
    }

    return nextTabs;
  }, [canSeeExamples, pathname]);

  const activeTab = tabs.find((tab) => tab.active) || tabs[0];

  return (
    <header className="app-header d-flex align-items-center justify-content-between gap-2">
      <div className="d-flex align-items-center gap-3 flex-wrap app-header-left">
        <div>
          <h1 className="app-header-title mb-0">PSBUniverse</h1>
          <p className="app-header-subtitle mb-0">Operations Workspace</p>
        </div>
        <nav className="app-header-tabs d-none d-md-flex" aria-label="Primary tabs">
          {tabs.map((tab) => (
            <a
              key={tab.key}
              href={tab.href}
              className={`app-header-tab ${tab.active ? "active" : ""}`}
            >
              {tab.label}
            </a>
          ))}
        </nav>
        <div className="app-header-mobile-nav d-md-none">
          <Form.Select
            size="sm"
            aria-label="Primary navigation"
            value={activeTab.href}
          onChange={(event) => {
            onNavigateStart?.();
            window.location.href = event.target.value;
          }}
          >
            {tabs.map((tab) => (
              <option key={tab.key} value={tab.href}>
                {tab.label}
              </option>
            ))}
          </Form.Select>
        </div>
      </div>
      <div className="d-flex align-items-center gap-2 app-header-right">
        <p className="app-header-user mb-0">{`${greeting}, ${displayName}`}</p>
        <Button variant="outline-primary" size="sm" onClick={onLogout} disabled={logoutBusy}>
          {logoutBusy ? "Signing out..." : "Logout"}
        </Button>
      </div>
      <div className="app-header-progress-shell" aria-hidden="true">
        <div
          className="app-header-progress-bar"
          style={{
            transform: `scaleX(${loaderProgress})`,
            opacity: loaderVisible ? 1 : 0,
          }}
        />
      </div>
    </header>
  );
}
