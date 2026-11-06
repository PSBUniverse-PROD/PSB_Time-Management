/**
 * Dealer "Login as" Endpoint
 * POST /api/dealer/login-as  { dealerId }
 * Lets PSB staff with the admin-enroll or admin-master role open a dealer's
 * portal account without its password, to fill in the dealer's details for
 * them. Sets the same dealer session cookie as /api/dealer/login, but leaves
 * last_login_at, failed attempts and the lock alone, so the dealer's own
 * sign-in history is unchanged. The staff session stays signed in.
 */

import { getSupabaseAdmin } from "@/core/supabase/admin";
import { DEALER_ACCOUNT_TABLE, buildDealerSessionCookie, createDealerSessionToken } from "@/core/dealer/dealerAuth";
import { DEALER_ADMIN_NO_ACCESS, getDealerAdminSession } from "@/modules/admin/dealer-master-setup/data/dealerAdminAccess.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body, status, extraHeaders = []) {
  return new Response(JSON.stringify(body), {
    status,
    headers: [["Content-Type", "application/json"], ["Cache-Control", "no-store"], ...extraHeaders],
  });
}

export async function POST(request) {
  try {
    const staffSession = await getDealerAdminSession();
    if (!staffSession) {
      return json({ success: false, error: DEALER_ADMIN_NO_ACCESS }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const dealerId = Number(body?.dealerId);
    if (!Number.isInteger(dealerId) || dealerId <= 0) {
      return json({ success: false, error: "Dealer is required." }, 400);
    }

    const supabase = getSupabaseAdmin();
    const [{ data: dealer }, { data: account }] = await Promise.all([
      supabase.from("psb_s_dealermaster").select("dealer_id, is_active").eq("dealer_id", dealerId).maybeSingle(),
      supabase.from(DEALER_ACCOUNT_TABLE).select("account_id, dealer_id, username, is_active").eq("dealer_id", dealerId).maybeSingle(),
    ]);

    // The portal turns away inactive dealers and logins, so say so here instead.
    if (!dealer) return json({ success: false, error: "That dealer no longer exists." }, 404);
    if (dealer.is_active === false) return json({ success: false, error: "Activate this dealer first." }, 409);
    if (!account) {
      return json({ success: false, error: "This dealer has no portal login yet. Create one with the key button first." }, 409);
    }
    if (account.is_active === false) {
      return json({ success: false, error: "This dealer's login is turned off. Turn it on with the key button first." }, 409);
    }

    const token = await createDealerSessionToken({
      dealerId: account.dealer_id,
      accountId: account.account_id,
      username: account.username,
      staff: { userId: staffSession.userId, name: staffSession.fullName || staffSession.email || "" },
    });
    const secure = new URL(request.url).protocol === "https:";
    return json({ success: true }, 200, [["Set-Cookie", buildDealerSessionCookie(token, { secure })]]);
  } catch (error) {
    console.error("Dealer login-as error:", error);
    return json({ success: false, error: "Unable to log in as this dealer right now.", unexpected: true }, 500);
  }
}
