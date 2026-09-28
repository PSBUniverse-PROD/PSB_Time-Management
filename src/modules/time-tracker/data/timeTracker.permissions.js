/**
 * Derive Time Tracker capabilities from app and organization roles.
 */

const TIME_TRACKER_APP_ID = "10";

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

export function getTimeTrackerPermissions(roles, orgRoles) {
  const appRoleNames = new Set(
    (Array.isArray(roles) ? roles : [])
      .filter((role) => role && String(role.app_id) === TIME_TRACKER_APP_ID && role.is_active !== false)
      .map((role) => normalizeName(role.role_name)),
  );

  const isEmployee = appRoleNames.has("employee");
  const isAdmin = appRoleNames.has("admin");
  const orgRoleNames = new Set(
    (Array.isArray(orgRoles) ? orgRoles : []).map((role) => normalizeName(role?.name)),
  );
  const isApprover = orgRoleNames.has(normalizeName("Timesheet Approver - VA"));
  const isRequestor = orgRoleNames.has(normalizeName("Timesheet Requestor - VA"));

  return {
    isEmployee,
    isAdmin,
    isApprover,
    isRequestor,
    canViewLogsTab: isEmployee || isAdmin,
    canViewTimesheetsTab: isAdmin,
    canViewApprovalsTab: isApprover,
    canViewSetupTab: isAdmin,
    canSubmitOwnTimesheet: isEmployee || isAdmin,
    canEditOwnTime: isEmployee || isAdmin,
    canViewOthersTimesheets: isAdmin,
    canEditOthersTimesheets: isAdmin,
    canPrintTimesheets: isAdmin,
    canApproveOrReturn: isApprover,
  };
}
