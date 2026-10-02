import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import * as sso from "../../src/core/sso-client.js";
import { isLoginPath, validateRedirectUrl } from "../../src/core/auth/redirect-validator.js";
import { hasAppAccess } from "../../src/core/auth/access.js";
import * as cookies from "../../src/core/auth/cookies.utils.js";
import * as cors from "../../src/core/auth/cors.utils.js";

const require = createRequire(import.meta.url);
const { transform, loadBindings } = require("next/dist/build/swc");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
await loadBindings();

async function loadComponent(file, mocks, globals = {}, extraSource = "") {
  const source = fs.readFileSync(path.join(root, file), "utf8") + extraSource;
  const compiled = await transform(source, {
    filename: file,
    jsc: { target: "es2022", parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const exports = {};
  vm.runInNewContext(compiled.code, {
    exports, URL, URLSearchParams, Request, Date,
    console: { debug() {}, error() {} },
    process: { env: {} },
    require: (name) => { assert.ok(name in mocks, `Unexpected dependency: ${name}`); return mocks[name]; },
    ...globals,
  });
  return exports;
}

function createHooks() {
  const states = [], refs = [], effects = [];
  let stateIndex = 0, refIndex = 0;
  const hooks = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(current) { const index = refIndex++; return refs[index] ||= { current }; },
    useEffect(effect) { effects.push(effect); },
    useMemo(factory) { return factory(); },
    useCallback(callback) { return callback; },
  };
  return { hooks, states, effects, render(callback) { stateIndex = 0; refIndex = 0; return callback(); } };
}

function createBrowser(pathname = "/time-tracker", search = "?view=week") {
  let nextTimer = 0;
  const timers = new Map(), intervals = new Map(), redirects = [];
  const location = { origin: "https://timesheets.psbuniverse.com", pathname, search, reload() {} };
  Object.defineProperty(location, "href", { get: () => location.origin + pathname + search, set: (value) => redirects.push(value) });
  const window = {
    location, fetch: async () => {}, addEventListener() {}, removeEventListener() {},
    setTimeout(handler, delay) { const id = ++nextTimer; timers.set(id, { handler, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(handler) { const id = ++nextTimer; intervals.set(id, handler); return id; },
    clearInterval(id) { intervals.delete(id); },
  };
  const document = { cookie: "", visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
  return { window, document, timers, intervals, redirects };
}

const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx };
const defaultExport = (value) => ({ __esModule: true, default: value });
const flush = async () => { for (let step = 0; step < 30; step++) await Promise.resolve(); };
const validSession = () => ({ userId: 1, email: "sso@example.invalid", fullName: "SSO User", roles: ["role-1"], expiresAt: Date.now() + 86400000 });

async function createProvider(isModule, initialSession, localUser = { id: "local-auth-user", email: "local@example.invalid" }, ssoEnabled = true) {
  const runtime = createHooks(), browser = createBrowser();
  let session = initialSession, authCallback;
  const counts = { local: 0, bootstrap: 0, signOut: 0, sso: 0 };
  const supabase = { auth: {
    getSession: async () => { counts.local++; return { data: { session: { access_token: "local-token" } } }; },
    getUser: async () => { counts.local++; return { data: { user: localUser } }; },
    onAuthStateChange: (callback) => { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: async () => { counts.signOut++; },
  } };
  const exports = await loadComponent("src/core/auth/AuthProvider.js", {
    react: runtime.hooks, "react/jsx-runtime": jsxRuntime,
    "@/core/auth/AuthContext": { AuthContext: { Provider: "Provider" } },
    "@/core/auth/SessionExpiryModal": defaultExport("ExpiryModal"),
    "@/core/supabase/client": { initSupabase() {}, getSupabase: () => supabase },
    "@/core/auth/bootstrap.actions": { bootstrapAuthState: async () => { counts.bootstrap++; return { authUser: localUser, dbUser: { email: localUser.email }, roles: [] }; } },
    "@/core/sso-client": { ...sso, SSO_ENABLED: ssoEnabled, IS_MODULE: isModule, validateSessionToken: async () => { counts.sso++; return session; },
      clearIntrospectCache() {}, clearPSBUserPayloadCookie() {}, redirectToLogin: (target) => browser.redirects.push(target) },
  }, browser);
  const render = () => runtime.render(() => exports.default({ children: "page" }));
  render();
  const cleanup = runtime.effects[0]();
  await flush();
  return { ...browser, counts, cleanup, context: () => render().props.value,
    setSession(value) { session = value; },
    event(event, value = null) { authCallback(event, value); },
    async immediate() { for (const [id, timer] of browser.timers) if (timer.delay === 0) { browser.timers.delete(id); await timer.handler(); } await flush(); },
    async poll() { [...browser.intervals.values()][0](); await flush(); },
  };
}

test("modules use core SSO and revalidate local sign-out without losing a valid shared session", async () => {
  const provider = await createProvider(true, validSession());
  assert.equal(provider.context().authUser.id, 1);
  assert.equal(provider.counts.local + provider.counts.bootstrap, 0);
  provider.event("SIGNED_IN", { user: { id: "stale-local-user" }, access_token: "stale-token" });
  await flush();
  assert.equal(provider.context().authUser.id, 1);
  provider.event("SIGNED_OUT"); await provider.immediate();
  assert.equal(provider.context().authUser.id, 1);
  assert.equal(provider.redirects.length, 0);
  provider.setSession(undefined); await provider.poll();
  assert.equal(provider.context().authUser.id, 1);
  provider.setSession(null); provider.event("SIGNED_OUT"); await provider.immediate();
  assert.equal(provider.context().authUser, null);
  assert.equal(provider.redirects.length, 1);
  assert.equal(provider.counts.signOut, 1);
  provider.cleanup();
});

test("module startup distinguishes unavailable core from an unauthenticated or expired session", async () => {
  const unavailable = await createProvider(true, undefined);
  assert.ok(unavailable.context().authError);
  assert.equal(unavailable.context().loading, false);
  assert.equal(unavailable.redirects.length, 0);
  unavailable.cleanup();
  for (const session of [null, { ...validSession(), expiresAt: Date.now() - 1 }]) {
    const provider = await createProvider(true, session);
    assert.equal(provider.context().authUser, null);
    assert.equal(provider.context().authError, "");
    provider.cleanup();
  }
});

test("periodic checks cannot reject fresh core login before its SSO cookie exists", async () => {
  const provider = await createProvider(false, null, null);
  provider.context().beginSessionEstablishment();
  provider.event("SIGNED_IN", { user: { id: "new-auth-user", email: "new@example.invalid" }, access_token: "new-token" });
  await flush();
  await provider.poll();
  assert.equal(provider.context().authUser.id, "new-auth-user");
  assert.equal(provider.redirects.length, 0);
  provider.setSession(validSession());
  await provider.context().finishSessionEstablishment();
  assert.equal(provider.redirects.length, 0);
  provider.setSession(null); await provider.poll(); await provider.immediate();
  assert.equal(provider.context().authUser, null);
  assert.equal(provider.redirects.length, 1);
  provider.cleanup();
});

test("a check started before sign-in cannot reject the newly established session", async () => {
  const provider = await createProvider(false, validSession());
  let resolveOldCheck;
  provider.setSession(new Promise((resolve) => { resolveOldCheck = resolve; }));
  await provider.poll();
  provider.context().beginSessionEstablishment();
  provider.setSession(validSession());
  await provider.context().finishSessionEstablishment();
  resolveOldCheck(null);
  await flush();
  await provider.immediate();
  assert.ok(provider.context().authUser, "An obsolete 401 must not clear a new sign-in");
  assert.equal(provider.redirects.length, 0);
  provider.cleanup();
});

async function createLayout(auth, pathname = "/login", search = "", ssoEnabled = true, logoutError = null) {
  const runtime = createHooks(), browser = createBrowser(pathname, search);
  const errors = [];
  const counts = { ssoLogout: 0, localLogout: 0 };
  const router = { replace: (target) => browser.redirects.push(target) };
  const exports = await loadComponent("src/shared/components/layout/AppLayout.js", {
    react: runtime.hooks, "react/jsx-runtime": jsxRuntime,
    "next/navigation": { usePathname: () => pathname, useRouter: () => router },
    "react-bootstrap": { Spinner: "Spinner" },
    "@/shared/components/ui/controls/Button": defaultExport("Button"),
    "@/shared/components/layout/Header": defaultExport("Header"),
    "@/core/auth/useAuth": { useAuth: () => ({ dbUser: null, roles: [], ...auth }) },
    "@/core/supabase/client": { getSupabase: () => ({ auth: { signOut: async () => { counts.localLogout++; } } }) },
    "@/shared/utils/toast": { toastError: (message) => errors.push(message) },
    "@/shared/utils/navbar-loader": { NAVBAR_LOADER_FINISH_EVENT: "finish", NAVBAR_LOADER_START_EVENT: "start" },
    "@/core/sso-client": { SSO_ENABLED: ssoEnabled, IS_MODULE: true, logout: async () => { counts.ssoLogout++; if (logoutError) throw logoutError; }, redirectToLogin: (target) => browser.redirects.push(target) },
    "@/core/auth/redirect-validator": { isLoginPath, validateRedirectUrl },
  }, { ...browser, process: { env: { NEXT_PUBLIC_ENV: "prod" } } });
  const tree = runtime.render(() => exports.default({ children: "credentials-form" }));
  runtime.effects.forEach((effect) => effect());
  return { ...browser, tree, errors, counts };
}

test("module login never shows credentials during verification and returns authenticated users locally", async () => {
  const checking = await createLayout({ loading: true, authUser: null });
  assert.ok(!JSON.stringify(checking.tree).includes("credentials-form"));
  assert.equal(checking.redirects.length, 0);
  const signedIn = await createLayout({ loading: false, authUser: { id: 1 } });
  assert.deepEqual(signedIn.redirects, ["/"]);
  const returnPath = await createLayout({ loading: false, authUser: { id: 1 } }, "/login", "?redirect=%2Ftime-tracker%3Fview%3Dweek");
  assert.deepEqual(returnPath.redirects, ["/time-tracker?view=week"]);
});

test("module routes preserve the return destination and show retry rather than login during outages", async () => {
  const missing = await createLayout({ loading: false, authUser: null }, "/time-tracker", "?view=week");
  assert.deepEqual(missing.redirects, ["/time-tracker?view=week"]);
  const unavailable = await createLayout({ loading: false, authUser: null, authError: "Core unavailable" });
  assert.equal(unavailable.redirects.length, 0);
  assert.ok(JSON.stringify(unavailable.tree).includes("Core unavailable"));
  assert.ok(!JSON.stringify(unavailable.tree).includes("credentials-form"));
});

test("module core-login redirects carry an absolute module URL", async () => {
  const browser = createBrowser();
  const client = await loadComponent("src/core/sso-client.js", {}, {
    ...browser, process: { env: { NEXT_PUBLIC_MODULE_KEY: "time-tracker", NEXT_PUBLIC_ENV: "prod", NEXT_PUBLIC_CORE_PORTAL_URL: "https://www.psbuniverse.com" } },
  });
  client.redirectToLogin("/time-tracker?view=week");
  const destination = new URL(browser.redirects[0]);
  assert.equal(destination.origin, "https://www.psbuniverse.com");
  assert.equal(destination.pathname, "/login");
  assert.equal(destination.searchParams.get("redirect"), "https://timesheets.psbuniverse.com/time-tracker?view=week");
});

test("module introspection is credentialed, bounded, and tolerates outages without inventing a session", async () => {
  let mode = "offline";
  const session = validSession();
  const client = await loadComponent("src/core/sso-client.js", {}, {
    AbortSignal,
    process: { env: { NEXT_PUBLIC_ENV: "prod", NEXT_PUBLIC_MODULE_KEY: "time-tracker", NEXT_PUBLIC_CORE_PORTAL_URL: "https://www.psbuniverse.com" } },
    fetch: async (url, options) => {
      assert.equal(url, "https://www.psbuniverse.com/api/auth/introspect?module=time-tracker");
      assert.equal(options.credentials, "include");
      assert.ok(options.signal instanceof AbortSignal);
      if (mode === "offline") throw new Error("Core unreachable");
      if (mode === "expired") return { ok: false, status: 401 };
      return { ok: true, json: async () => ({ ...session, authenticated: true }) };
    },
  });
  assert.equal(await client.validateSessionToken({ forceRefresh: true }), undefined);
  mode = "valid";
  assert.equal((await client.validateSessionToken({ forceRefresh: true })).userId, 1);
  mode = "offline";
  assert.equal((await client.validateSessionToken({ forceRefresh: true })).userId, 1);
  mode = "expired";
  assert.equal(await client.validateSessionToken({ forceRefresh: true }), null);
});

test("cleared introspection cache cannot be overwritten by an obsolete request", async () => {
  let resolveOldResponse;
  let requests = 0;
  const session = validSession();
  const client = await loadComponent("src/core/sso-client.js", {}, {
    AbortSignal,
    process: { env: { NEXT_PUBLIC_ENV: "prod" } },
    fetch: async () => {
      requests++;
      if (requests === 1) return new Promise((resolve) => { resolveOldResponse = resolve; });
      return { ok: true, json: async () => ({ ...session, authenticated: true }) };
    },
  });
  const obsoleteCheck = client.validateSessionToken({ forceRefresh: true });
  client.clearIntrospectCache();
  assert.equal((await client.validateSessionToken({ forceRefresh: true })).userId, 1);
  resolveOldResponse({ ok: false, status: 401 });
  await obsoleteCheck;
  assert.equal((await client.validateSessionToken()).userId, 1);
  assert.equal(requests, 2, "An old request must not invalidate the new cached session");
});

test("module root uses its declared route without resolving database access", async () => {
  const page = await loadComponent("src/app/page.js", {
    "next/navigation": { redirect: (target) => { throw new Error(`REDIRECT:${target}`); }, notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/modules/loadModules": { loadModules: async (options) => { assert.equal(options.resolveAccess, false); return [{ module_key: "time-tracker", routes: [{ path: "/login" }, { path: "/custom/schedule" }] }]; } },
    "@/core/auth/redirect-validator": { isLoginPath },
  }, { process: { env: { NEXT_PUBLIC_MODULE_KEY: "time-tracker" } } });
  await assert.rejects(page.default(), /REDIRECT:\/custom\/schedule/);
});

test("module roots with no usable declared route return 404 rather than loop through login", async () => {
  for (const modules of [[], [{ module_key: "time-tracker", routes: [] }],
    [{ module_key: "time-tracker", routes: [{ path: "/" }, { path: "/login" }, { path: "//external.example" }] }]]) {
    const page = await loadComponent("src/app/page.js", {
      "next/navigation": { redirect: (target) => { throw new Error(`UNEXPECTED_REDIRECT:${target}`); }, notFound: () => { throw new Error("NOT_FOUND"); } },
      "@/modules/loadModules": { loadModules: async () => modules },
      "@/core/auth/redirect-validator": { isLoginPath },
    }, { process: { env: { NEXT_PUBLIC_MODULE_KEY: "time-tracker" } } });
    await assert.rejects(page.default(), /NOT_FOUND/);
  }
  const core = await loadComponent("src/app/page.js", {
    "next/navigation": { redirect: (target) => { throw new Error(`REDIRECT:${target}`); }, notFound() {} },
    "@/modules/loadModules": { loadModules: async () => { throw new Error("Core root must not scan modules"); } },
    "@/core/auth/redirect-validator": { isLoginPath },
  });
  await assert.rejects(core.default(), /REDIRECT:\/dashboard/);
});

test("login return URLs reject login loops and protocol-relative external destinations", () => {
  assert.equal(validateRedirectUrl("//untrusted.example", "/"), "/");
  assert.equal(validateRedirectUrl("/\\untrusted.example", "/"), "/");
  assert.equal(validateRedirectUrl("//[", "/"), "/");
  assert.equal(validateRedirectUrl("/\\[", "/"), "/");
  assert.equal(validateRedirectUrl("/login", "/"), "/");
  assert.equal(validateRedirectUrl("https://psbuniverse.com/dashboard", "/"), "https://psbuniverse.com/dashboard");
  assert.equal(validateRedirectUrl("/time-tracker?view=week", "/"), "/time-tracker?view=week");
});

async function createLogin(postOk, session, ssoEnabled = true) {
  const runtime = createHooks(), browser = createBrowser("/login", "");
  const successes = [], errors = [];
  let bootstrapChecks = 0;
  let ssoCalls = 0;
  const exports = await loadComponent("src/modules/psbpages/login/pages/LoginView.jsx", {
    react: runtime.hooks, "react/jsx-runtime": jsxRuntime,
    "next/image": defaultExport("Image"), "next/navigation": { useRouter: () => ({ replace() {} }), useSearchParams: () => ({ get: () => null }) },
    "react-bootstrap": { Button: "Button", Form: "Form" },
    "@fortawesome/react-fontawesome": { FontAwesomeIcon: "Icon" }, "@fortawesome/free-solid-svg-icons": { faEye: {}, faEyeSlash: {} },
    "@/styles/psb_logo.png": defaultExport("logo"),
    "@/core/supabase/client": { getSupabase: () => ({ auth: { signInWithPassword: async () => ({ data: { session: { access_token: "test-token" } } }) } }) },
    "@/core/auth/useAuth": { useAuth: () => ({ authUser: null }) },
    "@/shared/utils/toast": { toastError: (message) => errors.push(message), toastSuccess: (message) => successes.push(message) },
    "@/core/auth/redirect-validator": { validateRedirectUrl },
    "@/core/sso-client": { SSO_ENABLED: ssoEnabled, clearIntrospectCache() {}, validateSessionToken: async () => { ssoCalls++; return session; } },
    "../data/login.data": { setAccessTokenCookie() {}, waitForServerSession: async () => { bootstrapChecks++; }, validateFields: () => ({ email: "", password: "" }), mapLoginError: (message) => message },
    "../data/login.actions": { resolveUsernameToEmail: async () => "test@example.invalid" },
  }, { ...browser, fetch: async () => { ssoCalls++; return { ok: postOk, json: async () => ({ error: "SSO creation rejected" }) }; } }, "\nexport { useLogin };\n");
  const render = () => runtime.render(() => exports.useLogin(null));
  let login = render();
  login.handleEmailChange({ target: { value: "test@example.invalid" } });
  login.handlePasswordChange({ target: { value: "synthetic-test-password" } });
  login = render();
  await login.handleSubmit({ preventDefault() {} });
  return { runtime, successes, errors, login: render(), bootstrapChecks, ssoCalls };
}

test("core login does not succeed until shared session creation and cookie verification succeed", async () => {
  for (const [postOk, session] of [[false, validSession()], [true, null], [true, undefined]]) {
    const rejected = await createLogin(postOk, session);
    assert.equal(rejected.successes.length, 0);
    assert.equal(rejected.runtime.states[0], null);
    assert.equal(rejected.bootstrapChecks, 0);
    assert.ok(rejected.login.inlineError);
  }
  const accepted = await createLogin(true, validSession());
  assert.equal(accepted.successes.length, 1);
  assert.equal(accepted.bootstrapChecks, 1);
  assert.ok(accepted.runtime.states[0]);
});

test("local mode uses Supabase auth and its login form without any SSO checks or timers", async () => {
  const provider = await createProvider(true, null, { id: "local-user", email: "local@example.invalid" }, false);
  assert.equal(provider.context().authUser.id, "local-user");
  assert.equal(provider.counts.sso, 0);
  assert.equal(provider.intervals.size, 0);
  provider.event("SIGNED_OUT"); await flush();
  assert.equal(provider.context().authUser, null);
  assert.equal(provider.counts.sso, 0);
  provider.cleanup();
  const layout = await createLayout({ loading: false, authUser: null }, "/login", "", false);
  assert.equal(layout.tree, "credentials-form");
  assert.equal(layout.redirects.length, 0);
  const login = await createLogin(false, null, false);
  assert.equal(login.successes.length, 1);
  assert.equal(login.bootstrapChecks, 1);
  assert.equal(login.ssoCalls, 0);
});

test("SSO clients run only in dev or prod and do no network work in local", async () => {
  for (const environment of ["local", "dev", "prod"]) {
    let requests = 0;
    const browser = createBrowser("/login", "");
    const client = await loadComponent("src/core/sso-client.js", {}, {
      ...browser, AbortSignal,
      process: { env: { NEXT_PUBLIC_ENV: environment, NEXT_PUBLIC_MODULE_KEY: "time-tracker" } },
      fetch: async () => { requests++; return { ok: true, json: async () => ({ ...validSession(), authenticated: true }) }; },
    });
    assert.equal(client.SSO_ENABLED, environment !== "local");
    const session = await client.validateSessionToken();
    if (environment === "local") {
      assert.equal(session, null);
      await client.logout();
      await assert.rejects(client.extendSession(), /SSO is disabled/);
      assert.equal(requests, 0);
      client.redirectToLogin("/time-tracker");
      assert.equal(new URL(browser.redirects[0]).origin, browser.window.location.origin);
    } else {
      assert.equal(session.userId, 1);
      assert.equal(requests, 1);
    }
  }
});

test("local module access uses bootstrap roles without calling SSO", async () => {
  let checks = 0;
  const runtime = createHooks();
  const gate = await loadComponent("src/core/auth/ModuleAccessGate.js", {
    react: runtime.hooks, "react/jsx-runtime": jsxRuntime,
    "react-bootstrap": { Container: "Container", Spinner: "Spinner" },
    "@/core/sso-client": { SSO_ENABLED: false, hasModuleAccess: async () => { checks++; return false; } },
    "@/core/auth/useAuth": { useAuth: () => ({ loading: false, authUser: { id: "local-user" }, roles: [{ app_id: "9", is_active: true }] }) },
    "@/core/auth/access": { hasAppAccess },
  });
  const allowed = runtime.render(() => gate.default({ appId: 9, children: "module-page" }));
  runtime.effects.forEach((effect) => effect());
  assert.equal(allowed, "module-page");
  const denied = runtime.render(() => gate.default({ appId: 8, children: "module-page" }));
  assert.ok(!JSON.stringify(denied).includes("module-page"));
  assert.equal(checks, 0);
});

test("local proxy does not accept an SSO cookie in place of local Supabase auth", async () => {
  const proxy = await loadComponent("src/proxy.js", {
    "next/server": { NextResponse: { next: () => ({ headers: new Headers() }), redirect: (url) => ({ redirect: url.href, headers: new Headers() }) } },
    "@/core/auth/redirect-validator": { isLoginPath }, "@/core/sso-client": { SSO_ENABLED: false },
  }, { Headers });
  const request = (cookies) => ({ nextUrl: { clone: () => new URL("http://localhost:3010/time-tracker"), toString: () => "http://localhost:3010/time-tracker" }, cookies: { get: (name) => cookies[name] ? { value: cookies[name] } : undefined } });
  assert.ok(proxy.proxy(request({ psb_session: "ignored-sso-cookie" })).redirect.includes("/login"));
  const local = proxy.proxy(request({ "sb-access-token": "local-token" }));
  assert.equal(local.redirect, undefined);
  assert.equal(local.headers.get("X-SSO-Enabled"), "false");
});

test("navbar logout returns hosted users to the portal root and keeps local logout local", async () => {
  for (const enabled of [true, false]) {
    const layout = await createLayout({ loading: false, authUser: { id: 1 } }, "/time-tracker", "", enabled);
    const header = layout.tree.props.children[0];
    await header.props.onLogout();
    assert.equal(layout.counts.ssoLogout, enabled ? 1 : 0);
    assert.equal(layout.counts.localLogout, 1);
    assert.deepEqual(layout.redirects, [enabled ? "https://www.psbuniverse.com/" : "/login"]);
  }
  const failed = await createLayout({ loading: false, authUser: { id: 1 } }, "/time-tracker", "", true, new Error("Core unavailable"));
  await failed.tree.props.children[0].props.onLogout();
  assert.equal(failed.redirects.length, 0);
  assert.equal(failed.errors.length, 1);
});

test("module logout calls core with credentials and reports rejected logout", async () => {
  let reject = false;
  const browser = createBrowser();
  const client = await loadComponent("src/core/sso-client.js", {}, {
    ...browser, AbortSignal,
    process: { env: { NEXT_PUBLIC_ENV: "prod", NEXT_PUBLIC_MODULE_KEY: "time-tracker" } },
    fetch: async (url, options) => {
      assert.equal(url, "https://www.psbuniverse.com/api/auth/logout");
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "include");
      assert.ok(options.signal instanceof AbortSignal);
      return { ok: !reject };
    },
  });
  await client.logout();
  reject = true;
  await assert.rejects(client.logout(), /Unable to end your shared session/);
});

test("core logout clears domain and host cookies with credentialed CORS", async () => {
  const invalidated = [];
  const endpoint = await loadComponent("src/app/api/auth/logout/route.js", {
    "@/core/auth/session.service": { invalidateSession: async (token) => invalidated.push(token) },
    "@/core/auth/cookies.utils": cookies,
    "@/core/auth/cors.utils": cors,
  }, { Response });
  const request = (origin) => new Request("https://www.psbuniverse.com/api/auth/logout", {
    method: "POST", headers: { origin, cookie: "psb_session=synthetic-token" },
  });
  const response = await endpoint.POST(request("https://timesheets.psbuniverse.com"));
  assert.equal(response.status, 200);
  assert.deepEqual(invalidated, ["synthetic-token"]);
  const expired = response.headers.getSetCookie();
  assert.equal(expired.length, 5);
  assert.equal(expired.filter((cookie) => cookie.includes("Domain=.psbuniverse.com")).length, 2);
  assert.ok(expired.every((cookie) => cookie.includes("Max-Age=0")));
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://timesheets.psbuniverse.com");
  assert.equal(response.headers.get("Access-Control-Allow-Credentials"), "true");
  assert.equal((await endpoint.POST(request("https://untrusted.example"))).status, 403);
  assert.equal(invalidated.length, 1);
});

test("hosted core cannot restore a logged-out SSO session from leftover local Supabase auth", async () => {
  const provider = await createProvider(false, null);
  assert.equal(provider.context().authUser, null);
  assert.equal(provider.counts.local, 0);
  provider.event("TOKEN_REFRESHED", { user: { id: "stale-user" }, access_token: "stale-token" });
  await flush();
  assert.equal(provider.context().authUser, null);
  provider.cleanup();
});