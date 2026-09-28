"use client";

import { createContext } from "react";

export const DEFAULT_AUTH_CONTEXT = Object.freeze({
  authUser: null,
  dbUser: null,
  roles: [],
  loading: true,
});

export const AuthContext = createContext(DEFAULT_AUTH_CONTEXT);
