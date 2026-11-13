import "server-only";
import companyDepartmentSetupModule from "../index.js";
import userMasterSetupModule from "@/modules/admin/user-master-setup/index.js";
import {
  SIGNED_OUT_MESSAGE, canOpenPage, requirePageAccess, requireSignedIn,
} from "@/core/auth/pageAccess.server.js";

// Thin wrappers over the shared card-based check (src/core/auth/pageAccess.server.js).
export const ORG_SIGNED_OUT = SIGNED_OUT_MESSAGE;

/** Organization Setup: positions, ranks, the company/department Save Batch and the position loader. */
export async function requireOrgEditor() {
  return requirePageAccess(companyDepartmentSetupModule);
}

/** User Master Setup actions. */
export async function requireUserMasterEditor() {
  return requirePageAccess(userMasterSetupModule);
}

/** Org Chart: any signed-in user may view it (read-only). Returns the session. */
export async function requireOrgChartViewer() {
  return requireSignedIn();
}

/** True when the signed-in user may use Organization Setup (to show its link). */
export async function canEditOrg() {
  return canOpenPage(companyDepartmentSetupModule);
}
