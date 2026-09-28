"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Spinner } from "react-bootstrap";
import Header from "@/shared/components/layout/Header";
import { useAuth } from "@/core/auth/useAuth";
import { getSupabase } from "@/core/supabase/client";
import {
  NAVBAR_LOADER_FINISH_EVENT,
  NAVBAR_LOADER_START_EVENT,
} from "@/shared/utils/navbar-loader";
import { logout as ssoLogout } from "@/core/sso-client";
import { validateRedirectUrl } from "@/core/auth/redirect-validator";

const CORE_PORTAL_URL = process.env.NEXT_PUBLIC_CORE_PORTAL_URL || "https://www.psbuniverse.com";
const ENV = process.env.NEXT_PUBLIC_ENV || "local";
const IS_PRODUCTION = ENV === "prod";

const SHOW_DELAY_MS = 140;
const PROGRESS_TICK_MS = 200;
const COMPLETE_FADE_MS = 320;
const RESET_MS = 220;
const START_PROGRESS = 0.26;
const MAX_IN_FLIGHT_PROGRESS = 0.9;

function clearAccessTokenCookie() {
  if (typeof document === "undefined") return;
  document.cookie = "sb-access-token=; Path=/; Max-Age=0; SameSite=Lax";
}

function isTrackableApiRequest(input) {
  if (typeof window === "undefined") return false;

  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof Request
        ? input.url
        : typeof input?.url === "string"
          ? input.url
          : null;

  if (!requestUrl) return false;

  try {
    const parsed = new URL(requestUrl, window.location.origin);
    if (parsed.origin !== window.location.origin) return false;
    if (!parsed.pathname.startsWith("/api/")) return false;

    return true;
  } catch {
    return false;
  }
}

function shouldStartRouteLoader(event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!anchor) return false;

  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }

  try {
    const current = new URL(window.location.href);
    const next = new URL(anchor.href, window.location.href);

    if (next.origin !== current.origin) return false;

    return next.pathname !== current.pathname || next.search !== current.search;
  } catch {
    return false;
  }
}

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, authUser, dbUser, roles } = useAuth();
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);

  const activeLoadCountRef = useRef(0);
  const hasMountedRouteRef = useRef(false);
  const progressRef = useRef(0);
  const progressIntervalRef = useRef(null);
  const showDelayTimerRef = useRef(null);
  const completionTimerRef = useRef(null);
  const resetTimerRef = useRef(null);

  const isLoginPage = pathname === "/login";
  const isAuthenticated = Boolean(authUser);

  const user = useMemo(() => {
    return {
      first_name: dbUser?.first_name,
      username: dbUser?.username,
      email: dbUser?.email || authUser?.email,
    };
  }, [authUser?.email, dbUser?.email, dbUser?.first_name, dbUser?.username]);

  const clearProgressTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    if (showDelayTimerRef.current) {
      window.clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
    }

    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  }, []);

  const beginProgress = useCallback(() => {
    if (typeof window === "undefined") return;

    if (completionTimerRef.current) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }

    progressRef.current = START_PROGRESS;
    setProgress(START_PROGRESS);

    if (!showDelayTimerRef.current) {
      showDelayTimerRef.current = window.setTimeout(() => {
        setProgressVisible(true);
        showDelayTimerRef.current = null;
      }, SHOW_DELAY_MS);
    }

    if (!progressIntervalRef.current) {
      progressIntervalRef.current = window.setInterval(() => {
        const nextProgress = Math.min(
          MAX_IN_FLIGHT_PROGRESS,
          progressRef.current + (1 - progressRef.current) * 0.05,
        );

        progressRef.current = nextProgress;
        setProgress(nextProgress);

        if (nextProgress >= MAX_IN_FLIGHT_PROGRESS) {
          window.clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }, PROGRESS_TICK_MS);
    }
  }, []);

  const completeProgress = useCallback(() => {
    if (typeof window === "undefined") return;

    if (progressIntervalRef.current) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // Fast requests finish before visibility delay to avoid UI flicker.
    if (showDelayTimerRef.current) {
      window.clearTimeout(showDelayTimerRef.current);
      showDelayTimerRef.current = null;
      progressRef.current = 0;
      setProgress(0);
      setProgressVisible(false);
      return;
    }

    progressRef.current = 1;
    setProgress(1);
    setProgressVisible(true);

    completionTimerRef.current = window.setTimeout(() => {
      setProgressVisible(false);
      completionTimerRef.current = null;

      resetTimerRef.current = window.setTimeout(() => {
        progressRef.current = 0;
        setProgress(0);
        resetTimerRef.current = null;
      }, RESET_MS);
    }, COMPLETE_FADE_MS);
  }, []);

  const startLoader = useCallback(() => {
    activeLoadCountRef.current += 1;

    if (activeLoadCountRef.current === 1) {
      beginProgress();
    }
  }, [beginProgress]);

  const finishLoader = useCallback(() => {
    if (activeLoadCountRef.current <= 0) {
      activeLoadCountRef.current = 0;
      return;
    }

    activeLoadCountRef.current -= 1;

    if (activeLoadCountRef.current === 0) {
      completeProgress();
    }
  }, [completeProgress]);

  useEffect(() => {
    if (!loading && !isAuthenticated && !isLoginPage) {
      startLoader();
      router.replace("/login");
    }
  }, [isAuthenticated, isLoginPage, loading, router, startLoader]);

  // Redirect already-authenticated users away from the login page.
  // Uses a ref to fire only once on initial mount, avoiding a race with
  // LoginView.jsx's own redirect after form submission.
  const loginRedirectFiredRef = useRef(false);
  useEffect(() => {
    if (!loading && isAuthenticated && isLoginPage && !loginRedirectFiredRef.current) {
      loginRedirectFiredRef.current = true;
      startLoader();
      const params = new URLSearchParams(window.location.search);
      const redirectParam = params.get("redirect");
      if (redirectParam) {
        const fallback = IS_PRODUCTION ? `${CORE_PORTAL_URL}/dashboard` : "/dashboard";
        const safeUrl = validateRedirectUrl(redirectParam, fallback);
        window.location.href = safeUrl;
      } else {
        window.location.href = IS_PRODUCTION ? `${CORE_PORTAL_URL}/dashboard` : "/dashboard";
      }
    }
  }, [isAuthenticated, isLoginPage, loading, router, startLoader]);

  useEffect(() => {
    if (!hasMountedRouteRef.current) {
      hasMountedRouteRef.current = true;
      return;
    }

    finishLoader();
  }, [finishLoader, pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (...args) => {
      const track = isTrackableApiRequest(args[0]);

      if (track) {
        startLoader();
      }

      try {
        return await originalFetch(...args);
      } finally {
        if (track) {
          finishLoader();
        }
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [finishLoader, startLoader]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onDocumentClick = (event) => {
      if (shouldStartRouteLoader(event)) {
        startLoader();
      }
    };

    const onPopState = () => {
      startLoader();
    };

    const onExternalLoaderStart = () => {
      startLoader();
    };

    const onExternalLoaderFinish = () => {
      finishLoader();
    };

    window.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener(NAVBAR_LOADER_START_EVENT, onExternalLoaderStart);
    window.addEventListener(NAVBAR_LOADER_FINISH_EVENT, onExternalLoaderFinish);

    return () => {
      window.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener(NAVBAR_LOADER_START_EVENT, onExternalLoaderStart);
      window.removeEventListener(NAVBAR_LOADER_FINISH_EVENT, onExternalLoaderFinish);
    };
  }, [finishLoader, startLoader]);

  useEffect(() => {
    return () => {
      clearProgressTimers();
    };
  }, [clearProgressTimers]);

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      // Attempt universal SSO logout first
      await ssoLogout();
    } catch {
      // Ignore SSO logout failure
    }

    try {
      const supabase = getSupabase();
      await supabase.auth.signOut();
    } catch {
      // Ignore Supabase sign-out failure
    }

    clearAccessTokenCookie();
    setLogoutBusy(false);
    startLoader();
    window.location.href = IS_PRODUCTION ? `${CORE_PORTAL_URL}/login` : "/login";
  }

  if (loading && !isLoginPage) {
    return (
      <main className="auth-loading">
        <Spinner animation="border" role="status" />
      </main>
    );
  }

  if (!isAuthenticated && !isLoginPage) {
    return null;
  }

  if (isLoginPage) {
    return children;
  }

  return (
    <div className="app-shell">
      <Header
        pathname={pathname}
        user={user}
        roles={roles}
        onLogout={handleLogout}
        logoutBusy={logoutBusy}
        onNavigateStart={startLoader}
        loaderProgress={progress}
        loaderVisible={progressVisible}
      />
      <main className="app-shell-body">{children}</main>
    </div>
  );
}