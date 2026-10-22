/**
 * Dealer Login Endpoint
 * POST /api/dealer/login  { username, password }
 * Checks psb_s_dealeraccount and sets the dealer session cookie. Separate from
 * internal sign-in: it never creates or reads psb_session / sb-access-token.
 */

import { getSupabaseAdmin } from "@/core/supabase/admin";
import {
  DEALER_ACCOUNT_TABLE,
  DEALER_LOCK_MINUTES,
  DEALER_MAX_FAILED_ATTEMPTS,
  buildDealerSessionCookie,
  createDealerSessionToken,
  verifyDealerPassword,
} from "@/core/dealer/dealerAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INVALID_MESSAGE = "Incorrect username or password.";

function json(body, status, extraHeaders = []) {
  return new Response(JSON.stringify(body), {
    status,
    headers: [["Content-Type", "application/json"], ["Cache-Control", "no-store"], ...extraHeaders],
  });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const username = String(body?.username ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");
    if (!username || !password) return json({ success: false, error: INVALID_MESSAGE }, 401);

    const supabase = getSupabaseAdmin();
    const { data: account, error: accountError } = await supabase
      .from(DEALER_ACCOUNT_TABLE)
      .select("account_id, dealer_id, username, password_hash, is_active, failed_attempts, locked_until")
      .eq("username", username)
      .maybeSingle();
    if (accountError) return json({ success: false, error: "Unable to sign in right now. Please try again." }, 503);
    if (!account) return json({ success: false, error: INVALID_MESSAGE }, 401);

    const now = Date.now();
    const lockedUntil = account.locked_until ? new Date(account.locked_until).getTime() : 0;
    if (lockedUntil > now) {
      const minutes = Math.max(1, Math.ceil((lockedUntil - now) / 60000));
      return json({ success: false, error: `Too many attempts. Try again in ${minutes} minute(s).` }, 423);
    }

    const passwordOk = await verifyDealerPassword(password, account.password_hash);
    if (!passwordOk) {
      const attempts = (Number(account.failed_attempts) || 0) + 1;
      const lockNow = attempts >= DEALER_MAX_FAILED_ATTEMPTS;
      await supabase
        .from(DEALER_ACCOUNT_TABLE)
        .update({
          failed_attempts: lockNow ? 0 : attempts,
          locked_until: lockNow ? new Date(now + DEALER_LOCK_MINUTES * 60000).toISOString() : null,
        })
        .eq("account_id", account.account_id);
      return json({ success: false, error: INVALID_MESSAGE }, 401);
    }

    // Checked only after the password, so a wrong guess learns nothing about the account.
    if (account.is_active === false) {
      return json({ success: false, error: "This login is disabled. Please contact PSB." }, 403);
    }

    const { data: dealer } = await supabase
      .from("psb_s_dealermaster")
      .select("dealer_id, is_active")
      .eq("dealer_id", account.dealer_id)
      .maybeSingle();
    if (!dealer || dealer.is_active === false) {
      return json({ success: false, error: "This dealer account is not active. Please contact PSB." }, 403);
    }

    await supabase
      .from(DEALER_ACCOUNT_TABLE)
      .update({ failed_attempts: 0, locked_until: null, last_login_at: new Date(now).toISOString() })
      .eq("account_id", account.account_id);

    const token = await createDealerSessionToken({
      dealerId: account.dealer_id,
      accountId: account.account_id,
      username: account.username,
    });
    const secure = new URL(request.url).protocol === "https:";
    return json({ success: true }, 200, [["Set-Cookie", buildDealerSessionCookie(token, { secure })]]);
  } catch (error) {
    console.error("Dealer login error:", error);
    return json({ success: false, error: "Unable to sign in right now. Please try again." }, 500);
  }
}
