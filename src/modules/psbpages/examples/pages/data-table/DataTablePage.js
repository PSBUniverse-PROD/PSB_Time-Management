"use client";

import { useAuth } from "@/core/auth/useAuth";
import DataTableExampleModule from "./DataTableExampleModule";

function resolveUserScope(authUser, dbUser) {
  const userId = String(dbUser?.user_id || authUser?.id || "").trim();
  if (userId) {
    return userId;
  }

  const email = String(dbUser?.email || authUser?.email || "").trim().toLowerCase();
  if (email) {
    return email;
  }

  return "anonymous";
}

export default function DataTableCompanionExamplePage() {
  const { authUser, dbUser } = useAuth();
  const userScope = resolveUserScope(authUser, dbUser);

  return <DataTableExampleModule key={userScope} userScope={userScope} />;
}
