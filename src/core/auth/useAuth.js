"use client";

import { useContext } from "react";
import { AuthContext, DEFAULT_AUTH_CONTEXT } from "@/core/auth/AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);
  return context ?? DEFAULT_AUTH_CONTEXT;
}
