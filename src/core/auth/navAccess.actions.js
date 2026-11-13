"use server";

import { getCurrentSession } from "@/core/auth/session.service";
import { userCanSeeDeveloperTabs } from "@/core/auth/developerTabs.server.js";

/** Core: whether the signed-in user should see the Example / Docs tabs. */
export async function canSeeDeveloperTabsAction() {
  try {
    const session = await getCurrentSession();
    return session?.userId ? await userCanSeeDeveloperTabs(session.userId) : false;
  } catch {
    return false;
  }
}