"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AuthContext, DEFAULT_AUTH_CONTEXT } from "@/core/auth/AuthContext";
import { getSupabase, initSupabase } from "@/core/supabase/client";
import { bootstrapAuthState } from "@/core/auth/bootstrap.actions";
import {
  validateSessionToken,
  buildUserFromSSOSession,
  buildDbUserFromSSOSession,
  buildRolesFromSSOSession,
} from "@/core/sso-client";

initSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function fallbackUserFromAuth(user) {
  return {
    email: user?.email || "",
    username:
      String(user?.user_metadata?.username || "").trim() ||
      String(user?.email || "").split("@")[0] ||
      "",
    first_name: String(user?.user_metadata?.first_name || "").trim(),
    last_name: String(user?.user_metadata?.last_name || "").trim(),
    phone: "",
    address: "",
    comp_name: "",
    comp_email: "",
    dept_name: "",
    status_name: "",
  };
}

async function fetchBootstrapState() {
  return bootstrapAuthState();
}

function setAccessTokenCookie(session) {
  if (typeof document === "undefined") {
    return;
  }

  if (!session?.access_token) {
    return;
  }

  const maxAge = Number.isFinite(session?.expires_in) ? session.expires_in : 3600;
  document.cookie = `sb-access-token=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearAccessTokenCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = "sb-access-token=; Path=/; Max-Age=0; SameSite=Lax";
}

function buildAuthUserFromBootstrap(payloadAuthUser) {
  if (!payloadAuthUser || typeof payloadAuthUser !== "object") {
    return null;
  }

  return {
    id: payloadAuthUser.id || "",
    email: payloadAuthUser.email || "",
    user_metadata:
      payloadAuthUser.user_metadata && typeof payloadAuthUser.user_metadata === "object"
        ? payloadAuthUser.user_metadata
        : {},
  };
}

export default function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasInitializedRef = useRef(false);
  const lastAuthUserIdRef = useRef(null);
  const lastBootstrapTsRef = useRef(0);

  /**
   * ── Cross-Tab Optimization: Session Fingerprint ─────────────────────
   *
   * Problem:
   *   Supabase's BroadcastChannel relays auth events (INITIAL_SESSION,
   *   TOKEN_REFRESHED) across ALL open tabs. The old guard only compared
   *   user IDs, which is too coarse — a duplicate tab for the same user
   *   always passed the check and triggered unnecessary re-hydration.
   *
   * Solution (Fix C):
   *   Store a composite fingerprint = userId::email::tokenPrefix(20).
   *   Before calling hydrateAuthState(), compare fingerprints. If they
   *   match, the session hasn't really changed — skip hydration entirely.
   *   SIGNED_OUT and USER_UPDATED bypass this check so logout and
   *   profile edits are never missed.
   *
   * ── Cross-Tab Optimization: Hydration Diff ──────────────────────────
   *
   * Problem:
   *   hydrateAuthState() unconditionally called setState for authUser,
   *   dbUser, AND roles on every invocation. Even when the resolved
   *   data was byte-for-byte identical to the current React state,
   *   all three setters fired, triggering a full subtree re-render.
   *
   * Solution (Fix D):
   *   Store snapshots of the last hydrated dbUser and roles in refs.
   *   Before calling setState, JSON-compare the incoming resolved
   *   values against the snapshots. If both match, skip all three
   *   setters. Also applies to handleVisibilityChange() — when the
   *   same user regains focus, fetch bootstrap state, diff against
   *   snapshots, and only hydrate if something actually changed.
   *   This eliminates the "stale re-render" on tab switch.
   *
   * ── Cross-Tab Optimization: INITIAL_SESSION Skip ────────────────────
   *
   * Problem:
   *   When a new/duplicated tab initializes, Supabase fires an
   *   INITIAL_SESSION event on that tab. But BroadcastChannel
   *   relays that event to EXISTING tabs too, causing them to
   *   re-run hydration logic for a session they already know about.
   *
   * Solution (Fix E):
   *   After initializeAuth() completes (hasInitializedRef = true),
   *   discard any subsequent INITIAL_SESSION events. These can only
   *   be replays from another tab — this tab's own init already
   *   handled the initial session.
   */
  const lastSessionFingerprintRef = useRef(null);
  const lastHydratedUserRef = useRef(null);
  const lastHydratedRolesRef = useRef(null);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    /**
     * Build a stable fingerprint that uniquely identifies the current session.
     * Combines userId, email, and the first 20 chars of the access token.
     * The token prefix catches actual session rotations (e.g. token refresh
     * issued a new token) without needing to store the full token in memory.
     *
     * @param {Object|null} sessionUser - The user object from the session
     * @param {string|null} sessionToken - The access token string
     * @returns {string|null} Composite fingerprint or null if no user
     */
    function buildSessionFingerprint(sessionUser, sessionToken) {
      if (!sessionUser?.id) return null;
      const tokenPrefix = sessionToken ? sessionToken.slice(0, 20) : "";
      return `${sessionUser.id}::${sessionUser.email || ""}::${tokenPrefix}`;
    }

    async function resetAuthState() {
      if (!active) {
        return;
      }

      setAuthUser(null);
      setDbUser(null);
      setRoles([]);
      lastAuthUserIdRef.current = null;
      lastSessionFingerprintRef.current = null;
      lastHydratedUserRef.current = null;
      lastHydratedRolesRef.current = null;
      setLoading(false);
    }

    async function hydrateAuthState(user, options = {}) {
      const background = Boolean(options.background);
      const syncBootstrap = options.syncBootstrap !== false;

      if (!active) {
        return;
      }

      if (!user) {
        await resetAuthState();
        return;
      }

      if (!background) {
        setLoading(true);
      }

      if (!syncBootstrap) {
        setAuthUser((currentAuthUser) => {
          if (!currentAuthUser) {
            return user;
          }

          return {
            ...currentAuthUser,
            ...user,
            user_metadata: user.user_metadata || currentAuthUser.user_metadata || {},
          };
        });

        if (!background) {
          setLoading(false);
        }

        return;
      }

      let resolvedAuthUser = user;
      let resolvedDbUser = fallbackUserFromAuth(user);
      let resolvedRoles = [];

      try {
        const payload = await fetchBootstrapState();

        if (payload?.authUser && typeof payload.authUser === "object") {
          resolvedAuthUser = {
            ...user,
            ...payload.authUser,
            user_metadata: payload.authUser.user_metadata || user.user_metadata || {},
          };
        }

        if (payload?.dbUser && typeof payload.dbUser === "object") {
          resolvedDbUser = payload.dbUser;
        }

        resolvedRoles = Array.isArray(payload?.roles) ? payload.roles : [];
      } catch {
        resolvedAuthUser = user;
        resolvedDbUser = fallbackUserFromAuth(user);
        resolvedRoles = [];
      }

      if (!active) {
        return;
      }

      // ── Fix C (Hydration Diff): Skip setState if nothing changed ──
      // JSON-compare the resolved values against the last hydrated
      // snapshots. If both dbUser and roles are identical, avoid
      // all three setState calls to prevent unnecessary re-renders.
      const isSameUser =
        lastHydratedUserRef.current &&
        JSON.stringify(resolvedDbUser) === JSON.stringify(lastHydratedUserRef.current);
      const isSameRoles =
        lastHydratedRolesRef.current &&
        JSON.stringify(resolvedRoles) === JSON.stringify(lastHydratedRolesRef.current);

      if (isSameUser && isSameRoles) {
        // Still update timestamps to keep the visibility throttle honest.
        lastBootstrapTsRef.current = Date.now();
        lastAuthUserIdRef.current = resolvedAuthUser?.id || null;
        if (!background) {
          setLoading(false);
        }
        return;
      }

      setAuthUser(resolvedAuthUser);
      setDbUser(resolvedDbUser);
      setRoles(resolvedRoles);
      lastAuthUserIdRef.current = resolvedAuthUser?.id || null;
      // Store snapshots for future diff comparisons.
      lastHydratedUserRef.current = resolvedDbUser;
      lastHydratedRolesRef.current = resolvedRoles;
      lastBootstrapTsRef.current = Date.now();
      if (!background) {
        setLoading(false);
      }
    }

    async function initializeAuth() {
      console.debug('[Auth] initializeAuth — mounting');  // remove when bug confirmed fixed
      setLoading(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          setAccessTokenCookie(sessionData.session);
        }

        const { data, error } = await supabase.auth.getUser();

        if (error || !data?.user) {
          // ── Fallback 1: Try server-side bootstrap (sb-access-token cookie) ──
          try {
            const bootstrapPayload = await fetchBootstrapState();
            const bootstrapAuthUser = buildAuthUserFromBootstrap(bootstrapPayload?.authUser);

            if (bootstrapAuthUser?.id) {
              setAuthUser(bootstrapAuthUser);
              setDbUser(
                bootstrapPayload?.dbUser && typeof bootstrapPayload.dbUser === "object"
                  ? bootstrapPayload.dbUser
                  : fallbackUserFromAuth(bootstrapAuthUser),
              );
              setRoles(Array.isArray(bootstrapPayload?.roles) ? bootstrapPayload.roles : []);
              lastAuthUserIdRef.current = bootstrapAuthUser.id;
              // Seed snapshot refs so the diff guard in hydrateAuthState
              // has a baseline to compare against.
              lastHydratedUserRef.current = bootstrapPayload?.dbUser || fallbackUserFromAuth(bootstrapAuthUser);
              lastHydratedRolesRef.current = Array.isArray(bootstrapPayload?.roles) ? bootstrapPayload.roles : [];
              setLoading(false);
              return;
            }
          } catch {
            // Ignore bootstrap fallback failure.
          }

          // ── Fallback 2: Try SSO session (psb_session cookie from Core Portal) ──
          try {
            const ssoSession = await validateSessionToken();
            if (ssoSession?.userId) {
              const ssoUser = buildUserFromSSOSession(ssoSession);
              const ssoDbUser = buildDbUserFromSSOSession(ssoSession);
              const ssoRoles = buildRolesFromSSOSession(ssoSession);

              setAuthUser(ssoUser);
              setDbUser(ssoDbUser);
              setRoles(ssoRoles);
              lastAuthUserIdRef.current = ssoUser.id;
              // Seed snapshot refs for the same reason as above.
              lastHydratedUserRef.current = ssoDbUser;
              lastHydratedRolesRef.current = ssoRoles;
              setLoading(false);
              return;
            }
          } catch {
            // Ignore SSO fallback failure.
          }

          await resetAuthState();
          return;
        }

        await hydrateAuthState(data?.user ?? null);
      } finally {
        hasInitializedRef.current = true;
      }
    }

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      console.debug('[Auth] onAuthStateChange', event, { init: hasInitializedRef.current, userId: lastAuthUserIdRef.current });  // remove when bug confirmed fixed
      if (session?.access_token) {
        setAccessTokenCookie(session);
      } else if (event === "SIGNED_OUT") {
        clearAccessTokenCookie();
      }

      // Block all events until initializeAuth() completes — it handles the initial session.
      if (!hasInitializedRef.current && event !== "SIGNED_OUT") {
        return;
      }

      // After init, INITIAL_SESSION is a replay from another tab opening — ignore.
      if (event === "INITIAL_SESSION") {
        return;
      }

      const sessionUser = session?.user ?? null;

      if (!sessionUser && event !== "SIGNED_OUT") {
        return;
      }

      // ── Fix C (Fingerprint): Skip when session hasn't changed ──
      // Build a fingerprint for the incoming session and compare it
      // to the last known fingerprint. A match means the same user
      // with the same token — no actual change, so skip hydration.
      // We explicitly allow SIGNED_OUT and USER_UPDATED through:
      //   - SIGNED_OUT: must always clear state
      //   - USER_UPDATED: profile metadata may change without a new token
      const incomingFingerprint = buildSessionFingerprint(sessionUser, session?.access_token);
      if (
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        incomingFingerprint &&
        incomingFingerprint === lastSessionFingerprintRef.current
      ) {
        return;
      }

      if (incomingFingerprint) {
        lastSessionFingerprintRef.current = incomingFingerprint;
      }

      // Legacy user-ID guard — still useful as a second line of defence.
      if (
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        sessionUser?.id &&
        sessionUser.id === lastAuthUserIdRef.current
      ) {
        return;
      }

      hydrateAuthState(sessionUser, {
        background: true,
        syncBootstrap: event !== "TOKEN_REFRESHED",
      });
    });

    // ── Visibility Change Handler ───────────────────────────────────
    // Re-bootstrap roles when the tab regains focus (e.g. after an
    // admin updates roles in another tab). Only fires if the tab was
    // actually hidden long enough to be stale — not on quick tab switches.
    let hiddenAt = null;
    const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }

      if (document.visibilityState !== "visible") return;
      if (!hasInitializedRef.current || !lastAuthUserIdRef.current) return;
      if (hiddenAt == null) return;
      const hiddenDuration = Date.now() - hiddenAt;
      hiddenAt = null;
      if (hiddenDuration < STALE_THRESHOLD_MS) return;

      // ── Fix D: Diff before hydrating on visibility change ──
      // Instead of blindly calling hydrateAuthState, we first fetch
      // the current bootstrap state and compare it to our last
      // hydrated snapshots. If nothing changed, skip hydration
      // entirely to avoid unnecessary re-renders.
      lastBootstrapTsRef.current = Date.now();
      supabase.auth.getUser().then(({ data: userData }) => {
        if (!active || !userData?.user) return;

        if (userData.user.id === lastAuthUserIdRef.current) {
          fetchBootstrapState().then((payload) => {
            if (!active) return;
            const incomingRoles = Array.isArray(payload?.roles) ? payload.roles : [];
            const incomingDbUser = payload?.dbUser && typeof payload.dbUser === "object"
              ? payload.dbUser
              : null;

            const rolesSame = lastHydratedRolesRef.current &&
              JSON.stringify(incomingRoles) === JSON.stringify(lastHydratedRolesRef.current);
            const userSame = lastHydratedUserRef.current &&
              incomingDbUser &&
              JSON.stringify(incomingDbUser) === JSON.stringify(lastHydratedUserRef.current);

            if (userSame && rolesSame) {
              // No changes detected — avoid the hydration cascade.
              return;
            }

            hydrateAuthState(userData.user, { background: true, syncBootstrap: true });
          });
          return;
        }

        // A different user logged in on another tab — proceed normally.
        hydrateAuthState(userData.user, { background: true, syncBootstrap: true });
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      authUser,
      dbUser,
      roles,
      loading,
    }),
    [authUser, dbUser, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}