import "server-only";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";

// Dealer sign-in is separate from internal SSO: its own table, its own cookie
// and its own signing key. Nothing here reads or writes internal sessions.

export const DEALER_ACCOUNT_TABLE = "psb_s_dealeraccount";
export const DEALER_SESSION_COOKIE = "psb_dealer_session";
export const DEALER_SESSION_MAX_AGE = 8 * 60 * 60; // seconds
export const DEALER_MAX_FAILED_ATTEMPTS = 5;
export const DEALER_LOCK_MINUTES = 1;

const DEALER_SESSION_AUDIENCE = "psb-dealer";
const DEALER_SESSION_LIFETIME = "8h";
const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes, so longer passwords are refused.
const PASSWORD_MAX_LENGTH = 72;
const BCRYPT_ROUNDS = 12;

function getDealerSecretKey() {
  const secret =
    process.env.DEALER_JWT_SECRET ||
    (process.env.JWT_SECRET ? `${process.env.JWT_SECRET}:dealer` : "");
  if (!secret) {
    throw new Error("Dealer sign-in is not configured (DEALER_JWT_SECRET or JWT_SECRET is missing).");
  }
  return new TextEncoder().encode(secret);
}

/** Usernames are stored lowercase: 3–50 letters, numbers, dot, dash or underscore. */
export function normalizeDealerUsername(value) {
  const username = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
    // `expected`: the user can fix this, so it is shown as a short message, not an error report.
    throw Object.assign(new Error("Username must be 3–50 characters: letters, numbers, dot, dash or underscore."), { expected: true });
  }
  return username;
}

export function validateDealerPassword(value) {
  const password = String(value ?? "");
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw Object.assign(new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`), { expected: true });
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw Object.assign(new Error(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`), { expected: true });
  }
  return password;
}

export async function hashDealerPassword(password) {
  return bcrypt.hash(validateDealerPassword(password), BCRYPT_ROUNDS);
}

export async function verifyDealerPassword(password, passwordHash) {
  if (!passwordHash) return false;
  return bcrypt.compare(String(password ?? ""), passwordHash);
}

/**
 * `staff` is set only by "Login as dealer": { userId, name } of the PSB staff
 * member viewing the account. A dealer's own sign-in never has it.
 */
export async function createDealerSessionToken({ dealerId, accountId, username, staff = null }) {
  const claims = { dealerId, accountId, username };
  if (staff?.userId) claims.staff = { userId: staff.userId, name: String(staff.name || "") };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(DEALER_SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(DEALER_SESSION_LIFETIME)
    .sign(getDealerSecretKey());
}

/**
 * Returns { dealerId, accountId, username, staff } or null when the token is
 * missing, invalid or expired. `staff` is { userId, name } in a "Login as
 * dealer" session, otherwise null.
 */
export async function verifyDealerSessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getDealerSecretKey(), { audience: DEALER_SESSION_AUDIENCE });
    if (!payload?.dealerId) return null;
    const staff = payload.staff?.userId ? { userId: payload.staff.userId, name: String(payload.staff.name || "") } : null;
    return { dealerId: payload.dealerId, accountId: payload.accountId, username: payload.username, staff };
  } catch {
    return null;
  }
}

/** The signed-in dealer for the current request (Server Component / Server Action), or null. */
export async function getDealerSession() {
  const cookieStore = await cookies();
  return verifyDealerSessionToken(cookieStore.get(DEALER_SESSION_COOKIE)?.value);
}

// Host-only on purpose (no Domain attribute): the cookie is never shared with
// other psbuniverse.com sites.
export function buildDealerSessionCookie(token, { secure = false } = {}) {
  let cookie = `${DEALER_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${DEALER_SESSION_MAX_AGE}; SameSite=Lax; HttpOnly`;
  if (secure) cookie += "; Secure";
  return cookie;
}

export function buildClearDealerSessionCookie({ secure = false } = {}) {
  let cookie = `${DEALER_SESSION_COOKIE}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; HttpOnly`;
  if (secure) cookie += "; Secure";
  return cookie;
}
