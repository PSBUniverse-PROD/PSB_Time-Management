/**
 * Dealer Logout Endpoint
 * POST /api/dealer/logout — clears the dealer session cookie.
 */

import { buildClearDealerSessionCookie } from "@/core/dealer/dealerAuth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const secure = new URL(request.url).protocol === "https:";
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: [
      ["Content-Type", "application/json"],
      ["Cache-Control", "no-store"],
      ["Set-Cookie", buildClearDealerSessionCookie({ secure })],
    ],
  });
}
