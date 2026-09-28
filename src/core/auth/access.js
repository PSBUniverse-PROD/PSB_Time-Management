function normalizeId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "false" || text === "0" || text === "f" || text === "n" || text === "no";
}

function isActiveMapping(record) {
  return !isInactiveFlag(record?.is_active);
}

export function hasAppAccess(userRoles, appId) {
  const normalizedAppId = normalizeId(appId);

  if (!Array.isArray(userRoles) || userRoles.length === 0 || !normalizedAppId) {
    return false;
  }

  return userRoles.some((role) => {
    if (!role) {
      return false;
    }

    if (!isActiveMapping(role)) {
      return false;
    }

    return normalizeId(role.app_id) === normalizedAppId;
  });
}

export function hasCardAccess(cardId, userRoles, cardRoleAccess) {
  const normalizedCardId = normalizeId(cardId);

  if (!normalizedCardId) {
    return false;
  }

  if (!Array.isArray(userRoles) || userRoles.length === 0) {
    return false;
  }

  if (!Array.isArray(cardRoleAccess) || cardRoleAccess.length === 0) {
    return false;
  }

  const activeRoleIds = new Set(
    userRoles
      .filter((role) => role && isActiveMapping(role))
      .map((role) => normalizeId(role.role_id))
      .filter(Boolean),
  );

  if (activeRoleIds.size === 0) {
    return false;
  }

  return cardRoleAccess.some((mapping) => {
    if (!mapping || !isActiveMapping(mapping)) {
      return false;
    }

    if (normalizeId(mapping.card_id) !== normalizedCardId) {
      return false;
    }

    return activeRoleIds.has(normalizeId(mapping.role_id));
  });
}
