import "server-only";
import { userIdCanOpenPage } from "@/core/auth/pageAccess.server.js";
import { routePathOf } from "@/core/routes.js";
import examplesModule from "@/modules/psbpages/examples/index.js";

// The Examples page (its address from the module), for the card check.
const EXAMPLES_PAGE = {
  name: examplesModule?.name,
  routes: [{ path: routePathOf(examplesModule, "ExamplesPage") }],
};

/**
 * Example / Docs tabs: shown when the user's role is given a card that opens
 * the Examples page in Card Module Setup. False when the check can't run.
 */
export async function userCanSeeDeveloperTabs(userId) {
  if (!userId) return false;
  try {
    return await userIdCanOpenPage(userId, EXAMPLES_PAGE);
  } catch {
    return false;
  }
}