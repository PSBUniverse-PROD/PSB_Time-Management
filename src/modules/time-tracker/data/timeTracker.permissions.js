/**
 * Derive Time Tracker capabilities from app and organization roles.
 */

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

export function getTimeTrackerPermissions(roles, orgRoles) {
  const appRoleNames = new Set(
    (Array.isArray(roles) ? roles : [])
      // Roles arrive already filtered to the Time Tracker app by
      // loadTimeTrackerRoles (server), which looks the app_id up by
      // module_key, so no app_id check is repeated here.
      .filter((role) => role && role.is_active !== false)
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
    canManageOthersTime: isAdmin,
    canSubmitOwnTimesheet: isEmployee || isAdmin,
    canEditOwnTime: isEmployee || isAdmin,
    canViewOthersTimesheets: isAdmin,
    canEditOthersTimesheets: isAdmin,
    canPrintTimesheets: isAdmin,
    canApproveOrReturn: isApprover,
  };
}
